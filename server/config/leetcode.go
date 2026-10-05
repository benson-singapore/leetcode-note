package config

import (
	"strings"
)

const DefaultLeetCodeUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"

// LeetCodeRequestAuth combines the account cookie with cookies gained by passing
// the browser verification. Account cookies win on duplicate names.
func LeetCodeRequestAuth(accountCookie string) (string, string, error) {
	verificationCookie, err := GetSetting("leetcode_cf_cookie")
	if err != nil {
		return "", "", err
	}
	userAgent, err := GetSetting("leetcode_cf_user_agent")
	if err != nil {
		return "", "", err
	}
	if userAgent == "" {
		userAgent = DefaultLeetCodeUserAgent
	}
	return mergeCookies(accountCookie, verificationCookie), userAgent, nil
}

func mergeCookies(accountCookie, verificationCookie string) string {
	parts := make([]string, 0)
	indexes := make(map[string]int)
	appendCookie := func(raw string, verification bool) {
		for _, part := range strings.Split(raw, ";") {
			part = strings.TrimSpace(part)
			name, _, ok := strings.Cut(part, "=")
			if !ok || name == "" {
				continue
			}
			if index, exists := indexes[name]; exists {
				// Login can capture a stale Cloudflare cookie. A later browser
				// verification must replace it, while account cookies such as
				// LEETCODE_SESSION and csrftoken continue to take precedence.
				if verification && isCloudflareCookie(name) {
					parts[index] = part
				}
				continue
			}
			indexes[name] = len(parts)
			parts = append(parts, part)
		}
	}
	appendCookie(accountCookie, false)
	appendCookie(verificationCookie, true)
	return strings.Join(parts, "; ")
}

func isCloudflareCookie(name string) bool {
	return strings.HasPrefix(name, "cf_") || strings.HasPrefix(name, "__cf")
}

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
