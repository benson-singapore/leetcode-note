package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/routes"
	"leetcode-note-sidecar/service"

	"github.com/gin-gonic/gin"
)

func main() {
	// 启动参数（由 Tauri 传入）
	var (
		port    = flag.Int("port", 17877, "HTTP 监听端口")
		dataDir = flag.String("data-dir", "", "数据目录（SQLite 与演示 HTML 存放处），默认为可执行文件所在目录")
		dev     = flag.Bool("dev", false, "开发模式（允许 0.0.0.0，便于本地调试）")
	)
	flag.Parse()

	if *dataDir != "" {
		if err := os.MkdirAll(*dataDir, 0755); err != nil {
			log.Fatalf("无法创建数据目录 %s: %v", *dataDir, err)
		}
		config.DBPath = filepath.Join(*dataDir, config.DBFileName)
	}

	// 初始化数据库
	if err := config.InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer config.CloseDB()

	// 执行数据库迁移
	if err := service.MigrateDatabase(); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	// 本地应用：生产模式仅绑定 127.0.0.1
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(config.CORSMiddleware())

	// 健康检查（Tauri 侧用于探测 sidecar 就绪）
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// 注册路由
	routes.RegisterRoutes(r)

	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	if *dev {
		addr = fmt.Sprintf(":%d", *port)
	}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", addr, err)
	}
	log.Printf("LeetCode Note sidecar listening on %s", addr)

	// 优雅退出
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		log.Println("Shutting down sidecar...")
		_ = ln.Close()
	}()

	if err := r.RunListener(ln); err != nil {
		log.Fatalf("Server exited: %v", err)
	}
	log.Println("Sidecar stopped")
}
