package config

import (
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORSMiddleware 为浏览器跨域场景（例如前端在 Cloudflare Pages、API 在独立域名）。
//
// 若设置了 CORS_ALLOWED_ORIGINS（逗号分隔），则只允许列表中的 Origin；与 gin-contrib/cors 行为一致：
// 预检 OPTIONS 时若 Origin 不在列表中，会返回 403 且响应里不带 Access-Control-Allow-Origin，
// 浏览器即报 “No 'Access-Control-Allow-Origin' header”（易被误认为是「没配 CORS」）。
// 必须把前端完整 Origin 写进去，例如 https://leetcode-note.pages.dev（注意 https、无尾部斜杠）。
// 也可写一条 https://*.pages.dev 并配合 AllowWildcard，以覆盖所有 *.pages.dev 预览/生产子域。
// 未设置 CORS_ALLOWED_ORIGINS 时允许任意 Origin（Access-Control-Allow-Origin: *）。
func CORSMiddleware() gin.HandlerFunc {
	cfg := cors.Config{
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"},
		AllowHeaders: []string{
			"Origin", "Content-Length", "Content-Type", "Authorization",
			"Accept", "Accept-Language", "X-Requested-With",
		},
		MaxAge: 12 * time.Hour,
	}
	if raw := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS")); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			t := strings.TrimSpace(strings.TrimSuffix(o, "/"))
			if t == "" {
				continue
			}
			if strings.Contains(t, "*") {
				cfg.AllowWildcard = true
			}
			cfg.AllowOrigins = append(cfg.AllowOrigins, t)
		}
	}
	if len(cfg.AllowOrigins) == 0 {
		cfg.AllowAllOrigins = true
	}
	return cors.New(cfg)
}
