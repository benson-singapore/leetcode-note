package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/textproto"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	imgbbOfficialEndpoint = "https://api.imgbb.com/1/upload"
	imgbbWebJSONEndpoint  = "https://imgbb.com/json"
	imgbbHomeURL            = "https://imgbb.com/"
)

// 首页 HTML 中的 auth_token="..."，与浏览器访问 imgbb 一致。
var authTokenHTMLRe = regexp.MustCompile(`auth_token="([^"]+)"`)

// ImgbbService 上传策略：
// 1) 若设置 IMGBB_API_KEY → 官方 API（可选）
// 2) 否则走 imgbb.com/json（与 curl 一致）。未设置 IMGBB_AUTH_TOKEN 时，自动 GET 首页解析 auth_token 并用 Cookie Jar 保存 PHPSESSID，无需本地配置。
type ImgbbService struct {
	client *http.Client
}

func NewImgbbService() *ImgbbService {
	return &ImgbbService{
		client: &http.Client{Timeout: 90 * time.Second},
	}
}

func officialAPIKey() string {
	return strings.TrimSpace(os.Getenv("IMGBB_API_KEY"))
}

func useOfficialAPI() bool {
	return officialAPIKey() != ""
}

type imgbbOfficialResponse struct {
	Data struct {
		URL string `json:"url"`
	} `json:"data"`
	Success bool `json:"success"`
	Status  int  `json:"status"`
	Error   *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (s *ImgbbService) postOfficialAPI(imagePayload string) (previewURL string, err error) {
	key := officialAPIKey()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	if err := w.WriteField("key", key); err != nil {
		return "", err
	}
	if err := w.WriteField("image", imagePayload); err != nil {
		return "", err
	}
	if err := w.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, imgbbOfficialEndpoint, &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求 ImgBB 官方 API 失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var parsed imgbbOfficialResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("解析 ImgBB 官方响应失败: %w", err)
	}

	if !parsed.Success || strings.TrimSpace(parsed.Data.URL) == "" {
		msg := "ImgBB 官方 API 上传失败"
		if parsed.Error != nil && parsed.Error.Message != "" {
			msg = parsed.Error.Message
		}
		return "", fmt.Errorf("%s", msg)
	}

	return parsed.Data.URL, nil
}

// --- 网页 /json（与 curl 一致）---

type imgbbWebJSONResponse struct {
	StatusCode int `json:"status_code"`
	StatusTxt  string `json:"status_txt"`
	Image      *struct {
		URL string `json:"url"`
	} `json:"image"`
}

// 手动指定与 curl 一致：IMGBB_AUTH_TOKEN + IMGBB_PHPSESSID / IMGBB_COOKIE
func webUploadCredentials() (authToken string, cookieHeader string, ok bool) {
	authToken = strings.TrimSpace(os.Getenv("IMGBB_AUTH_TOKEN"))
	if authToken == "" {
		return "", "", false
	}
	if full := strings.TrimSpace(os.Getenv("IMGBB_COOKIE")); full != "" {
		return authToken, full, true
	}
	sid := strings.TrimSpace(os.Getenv("IMGBB_PHPSESSID"))
	if sid == "" {
		return "", "", false
	}
	return authToken, "PHPSESSID=" + sid, true
}

// bootstrapImgbbSession 模拟浏览器：GET 首页 → 收 Cookie → 从 HTML 取 auth_token（与 curl 同源会话）。
func bootstrapImgbbSession() (authToken string, client *http.Client, err error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return "", nil, err
	}
	client = &http.Client{
		Jar:     jar,
		Timeout: 90 * time.Second,
	}

	req, err := http.NewRequest(http.MethodGet, imgbbHomeURL, nil)
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh,en;q=0.9,zh-CN;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("访问 imgbb 首页失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, err
	}

	m := authTokenHTMLRe.FindSubmatch(body)
	if len(m) < 2 {
		return "", nil, fmt.Errorf("无法在 imgbb 首页解析 auth_token")
	}
	return string(m[1]), client, nil
}

func (s *ImgbbService) postWebJSON(writeSource func(*multipart.Writer) error, sourceType string) (previewURL string, err error) {
	var authToken string
	var httpClient *http.Client
	var manualCookie string

	if t, c, ok := webUploadCredentials(); ok {
		authToken = t
		manualCookie = c
		httpClient = s.client
	} else {
		var err error
		authToken, httpClient, err = bootstrapImgbbSession()
		if err != nil {
			return "", fmt.Errorf("imgbb 会话失败: %w（可设置 IMGBB_AUTH_TOKEN+IMGBB_PHPSESSID 与 curl 一致，或配置 IMGBB_API_KEY）", err)
		}
	}

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	if err := writeSource(w); err != nil {
		return "", err
	}
	if err := w.WriteField("type", sourceType); err != nil {
		return "", err
	}
	if err := w.WriteField("action", "upload"); err != nil {
		return "", err
	}
	if err := w.WriteField("timestamp", strconv.FormatInt(time.Now().UnixMilli(), 10)); err != nil {
		return "", err
	}
	if err := w.WriteField("auth_token", authToken); err != nil {
		return "", err
	}
	if err := w.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, imgbbWebJSONEndpoint, &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "zh,en;q=0.9,zh-CN;q=0.8")
	req.Header.Set("Origin", "https://imgbb.com")
	req.Header.Set("Referer", "https://imgbb.com/")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")
	req.Header.Set("Content-Type", w.FormDataContentType())
	if manualCookie != "" {
		req.Header.Set("Cookie", manualCookie)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求 imgbb.com/json 失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var parsed imgbbWebJSONResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("解析 imgbb 响应失败: %w，原始: %s", err, truncateForErr(body))
	}

	if parsed.StatusCode != 200 || parsed.Image == nil || strings.TrimSpace(parsed.Image.URL) == "" {
		msg := strings.TrimSpace(parsed.StatusTxt)
		if msg == "" {
			msg = string(truncateForErr(body))
		}
		if msg == "" {
			msg = "imgbb 未返回 image.url"
		}
		return "", fmt.Errorf("imgbb 上传失败: %s", msg)
	}

	return parsed.Image.URL, nil
}

func truncateForErr(b []byte) []byte {
	const max = 512
	if len(b) <= max {
		return b
	}
	return append(b[:max], '.', '.', '.')
}

// UploadFileBytes 上传本机文件。
func (s *ImgbbService) UploadFileBytes(raw []byte, filename string) (previewURL string, err error) {
	if len(raw) == 0 {
		return "", fmt.Errorf("文件为空")
	}
	filename = strings.TrimSpace(filename)
	if filename == "" {
		filename = "upload.bin"
	}
	base := filepath.Base(filename)
	if base == "." || base == "/" {
		base = "upload.bin"
	}
	safeName := strings.ReplaceAll(base, `"`, "_")
	mediaType := mime.TypeByExtension(strings.ToLower(filepath.Ext(base)))
	if mediaType == "" {
		mediaType = "application/octet-stream"
	}

	if useOfficialAPI() {
		b64 := base64.StdEncoding.EncodeToString(raw)
		return s.postOfficialAPI(b64)
	}

	return s.postWebJSON(func(w *multipart.Writer) error {
		h := make(textproto.MIMEHeader)
		h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="source"; filename="%s"`, safeName))
		h.Set("Content-Type", mediaType)
		part, err := w.CreatePart(h)
		if err != nil {
			return err
		}
		_, err = part.Write(raw)
		return err
	}, "file")
}

// UploadFromURL 通过图片直链转存。
func (s *ImgbbService) UploadFromURL(imageURL string) (previewURL string, err error) {
	imageURL = strings.TrimSpace(imageURL)
	if imageURL == "" {
		return "", fmt.Errorf("图片 URL 不能为空")
	}

	if useOfficialAPI() {
		return s.postOfficialAPI(imageURL)
	}

	return s.postWebJSON(func(w *multipart.Writer) error {
		return w.WriteField("source", imageURL)
	}, "url")
}
