package config

import (
	"database/sql"
	"embed"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

//go:embed resources/schema.sql
var schemaFS embed.FS

var DB *sql.DB

// DBFileName 数据库文件名
const DBFileName = "leetcode_note.db"

// DBPath 数据库文件绝对路径，由 main 根据 --data-dir 启动参数设置
var DBPath = "leetcode_note.db"

// InitDB 初始化数据库（modernc.org/sqlite，纯 Go 驱动，免 CGO）
func InitDB() error {
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)", DBPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// modernc/sqlite 是单写者模型，限制连接数避免 SQLITE_BUSY
	db.SetMaxOpenConns(1)

	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	DB = db

	if err := initSchema(); err != nil {
		return fmt.Errorf("failed to initialize schema: %w", err)
	}

	if err := EnsureSolutionDemoDir(); err != nil {
		log.Printf("Warning: could not create html-demos directory: %v", err)
	}

	log.Printf("Database initialized successfully at %s", DBPath)
	return nil
}

// CloseDB 关闭数据库连接
func CloseDB() {
	if DB != nil {
		_ = DB.Close()
	}
}

// initSchema 执行内嵌的 schema.sql 初始化表结构
func initSchema() error {
	sqlBytes, err := schemaFS.ReadFile("resources/schema.sql")
	if err != nil {
		return fmt.Errorf("failed to read embedded schema.sql: %w", err)
	}
	if _, err := DB.Exec(string(sqlBytes)); err != nil {
		return fmt.Errorf("failed to execute schema: %w", err)
	}
	log.Println("Schema initialized (embedded schema.sql)")
	return nil
}

// DataDirectory 返回数据库文件所在目录
func DataDirectory() (string, error) {
	absDB, err := filepath.Abs(DBPath)
	if err != nil {
		return "", err
	}
	return filepath.Dir(absDB), nil
}

// SolutionDemoDir 题解演示 HTML 目录（与数据库同目录）
func SolutionDemoDir() (string, error) {
	dir, err := DataDirectory()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "html-demos"), nil
}

// EnsureSolutionDemoDir 创建 html-demos 目录（如不存在）
func EnsureSolutionDemoDir() error {
	dir, err := SolutionDemoDir()
	if err != nil {
		return err
	}
	return os.MkdirAll(dir, 0755)
}

// SettingsTable 用于 setting key/value 存取的便捷方法
func GetSetting(key string) (string, error) {
	var val string
	err := DB.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&val)
	if err != nil && strings.Contains(err.Error(), "no rows") {
		return "", nil
	}
	return val, err
}

func SetSetting(key, value string) error {
	_, err := DB.Exec(`
		INSERT INTO settings(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
	`, key, value)
	return err
}
