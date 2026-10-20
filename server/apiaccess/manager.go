package apiaccess

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"

	"leetcode-note-sidecar/config"
)

const tokenSettingKey = "api_service_token"

// Manager controls the optional LAN-facing API listener. The desktop sidecar
// remains bound to loopback and continues serving the UI independently.
type Manager struct {
	mu      sync.Mutex
	port    int
	handler http.Handler
	server  *http.Server
}

type Address struct {
	Host       string `json:"host"`
	APIURL     string `json:"api_url"`
	SwaggerURL string `json:"swagger_url"`
}

type Status struct {
	Enabled   bool      `json:"enabled"`
	Port      int       `json:"port"`
	Addresses []Address `json:"addresses"`
	Token     string    `json:"token,omitempty"`
}

func NewManager(port int) *Manager {
	return &Manager{port: port}
}

func (m *Manager) SetHandler(handler http.Handler) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handler = handler
}

// SetEnabled starts or stops the external API listener. The listener is
// bound to all interfaces only after an explicit enable action.
func (m *Manager) SetEnabled(enabled bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !enabled {
		if m.server != nil {
			_ = m.server.Close()
			m.server = nil
		}
		return nil
	}
	if m.server != nil {
		return nil
	}
	if m.handler == nil {
		return fmt.Errorf("API 服务尚未完成初始化")
	}

	token, err := getOrCreateToken()
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", m.port))
	if err != nil {
		return fmt.Errorf("无法监听 API 端口 %d: %w", m.port, err)
	}

	server := &http.Server{Handler: bearerAuth(m.handler, token)}
	m.server = server
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("External API server stopped: %v", err)
		}
		m.mu.Lock()
		if m.server == server {
			m.server = nil
		}
		m.mu.Unlock()
	}()
	log.Printf("External API server listening on 0.0.0.0:%d", m.port)
	return nil
}

func (m *Manager) Status() Status {
	m.mu.Lock()
	enabled := m.server != nil
	port := m.port
	m.mu.Unlock()

	status := Status{Enabled: enabled, Port: port, Addresses: serviceAddresses(port)}
	if enabled {
		status.Token, _ = config.GetSetting(tokenSettingKey)
	}
	return status
}

func getOrCreateToken() (string, error) {
	token, err := config.GetSetting(tokenSettingKey)
	if err != nil {
		return "", fmt.Errorf("读取 API 授权令牌失败: %w", err)
	}
	if token != "" {
		return token, nil
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("生成 API 授权令牌失败: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	if err := config.SetSetting(tokenSettingKey, token); err != nil {
		return "", fmt.Errorf("保存 API 授权令牌失败: %w", err)
	}
	return token, nil
}

func bearerAuth(next http.Handler, token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Let browsers complete CORS preflight without credentials. The actual
		// request still has to present the token.
		if r.Method == http.MethodOptions || !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		provided := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if provided == r.Header.Get("Authorization") || len(provided) != len(token) || subtle.ConstantTimeCompare([]byte(provided), []byte(token)) != 1 {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"code": 401, "message": "缺少或无效的 Bearer API 令牌"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func serviceAddresses(port int) []Address {
	hosts := []string{"127.0.0.1"}
	interfaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range interfaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			addresses, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, address := range addresses {
				ip, _, err := net.ParseCIDR(address.String())
				if err == nil && ip.To4() != nil && !ip.IsLoopback() {
					hosts = append(hosts, ip.String())
				}
			}
		}
	}
	sort.Strings(hosts[1:])

	addresses := make([]Address, 0, len(hosts))
	for _, host := range hosts {
		base := fmt.Sprintf("http://%s:%d", host, port)
		addresses = append(addresses, Address{
			Host:       host,
			APIURL:     base + "/api/v1",
			SwaggerURL: base + "/swagger/index.html",
		})
	}
	return addresses
}
