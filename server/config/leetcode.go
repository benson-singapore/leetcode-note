package config

import (
	"strings"
)

// ExtractLeetCodeCSRF 从 Cookie 字符串中解析 csrftoken，供 GraphQL noj-go 等需 x-csrftoken 的接口使用
func ExtractLeetCodeCSRF(cookie string) string {
	for _, part := range strings.Split(cookie, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "csrftoken=") {
			return strings.TrimPrefix(part, "csrftoken=")
		}
	}
	return ""
}
