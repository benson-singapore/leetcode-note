package controller

import (
	"io"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/service"
	"leetcode-note-sidecar/utils"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

const maxImageUploadBytes = 20 << 20 // 20 MiB（ImgBB 官方上限 32MB）

type ImageController struct {
	imgbb *service.ImgbbService
}

func NewImageController() *ImageController {
	return &ImageController{
		imgbb: service.NewImgbbService(),
	}
}

// UploadImage 表单上传图片文件，字段名 file；成功返回 data.image.url。
// @Summary 上传图片文件到图床
// @Description 使用 multipart 表单字段 file 上传。默认自动访问 imgbb 首页获取会话（与 curl 同源）；也可选手动设置 IMGBB_AUTH_TOKEN+IMGBB_PHPSESSID，或设置 IMGBB_API_KEY 走官方 API。成功时 data.image.url 为预览地址。
// @Tags Images
// @Accept multipart/form-data
// @Produce json
// @Param file formData file true "图片文件"
// @Success 200 {object} utils.Response{data=models.ImageUploadResult}
// @Failure 400 {object} utils.Response
// @Failure 401 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /images/upload [post]
func (c *ImageController) UploadImage(ctx *gin.Context) {
	// multipart 边界等会有额外开销，略放宽上限
	ctx.Request.Body = http.MaxBytesReader(ctx.Writer, ctx.Request.Body, maxImageUploadBytes+2<<20)

	if err := ctx.Request.ParseMultipartForm(maxImageUploadBytes); err != nil {
		utils.BadRequest(ctx, "无法解析上传文件: "+err.Error())
		return
	}
	fh, err := ctx.FormFile("file")
	if err != nil {
		utils.BadRequest(ctx, "请使用表单字段 file 上传图片")
		return
	}
	if fh.Size > maxImageUploadBytes {
		utils.BadRequest(ctx, "图片过大，请小于 20MB")
		return
	}

	src, err := fh.Open()
	if err != nil {
		utils.InternalError(ctx, "读取文件失败")
		return
	}
	defer src.Close()

	raw, err := io.ReadAll(io.LimitReader(src, maxImageUploadBytes+1))
	if err != nil {
		utils.InternalError(ctx, "读取文件失败")
		return
	}
	if int64(len(raw)) > maxImageUploadBytes {
		utils.BadRequest(ctx, "图片过大，请小于 20MB")
		return
	}

	if !looksLikeImageExt(fh.Filename) {
		utils.BadRequest(ctx, "请上传常见图片格式（如 png、jpg、gif、webp）")
		return
	}

	url, err := c.imgbb.UploadFileBytes(raw, fh.Filename)
	if err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	utils.Success(ctx, gin.H{
		"image": gin.H{"url": url},
	})
}

// UploadImageByURL JSON body: { "url": "https://..." }；成功返回 data.image.url。
// @Summary 通过图片 URL 转存图床
// @Description 请求体为 JSON，字段 url 为可直链访问的图片地址。默认自动 imgbb 网页会话；可选 IMGBB_AUTH_TOKEN+Cookie 或 IMGBB_API_KEY。
// @Tags Images
// @Accept json
// @Produce json
// @Param request body models.UploadImageByURLRequest true "图片直链"
// @Success 200 {object} utils.Response{data=models.ImageUploadResult}
// @Failure 400 {object} utils.Response
// @Failure 401 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /images/upload-url [post]
func (c *ImageController) UploadImageByURL(ctx *gin.Context) {
	var req models.UploadImageByURLRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}

	url, err := c.imgbb.UploadFromURL(req.URL)
	if err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	utils.Success(ctx, gin.H{
		"image": gin.H{"url": url},
	})
}

func looksLikeImageExt(name string) bool {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
	switch ext {
	case "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif":
		return true
	default:
		return ext == "" // 部分客户端可能不带扩展名，仍尝试上传
	}
}
