# LeetCode 学习笔记（Tauri2 桌面应用）
# 常用命令：make help

SHELL := /bin/bash
.DEFAULT_GOAL := help

# 可覆盖变量：PORT=17877 TARGET=aarch64-apple-darwin make sidecar
PORT ?= 17877
DATA_DIR ?= $(CURDIR)/server/data

# ============ 依赖安装 ============

.PHONY: install
install: install-frontend check-env ## 安装全部开发依赖（前端 + 校验本地工具链）

.PHONY: install-frontend
install-frontend: ## 安装前端 npm 依赖
	@echo "==> npm install"
	npm install

.PHONY: check-env
check-env: ## 校验本地工具链（node/go/rust/tauri-cli）
	@command -v node >/dev/null   || { echo "❌ 缺少 Node.js（>= 20）"; exit 1; }
	@command -v go >/dev/null     || { echo "❌ 缺少 Go（>= 1.24）"; exit 1; }
	@command -v cargo >/dev/null  || { echo "❌ 缺少 Rust 工具链"; exit 1; }
	@command -v tauri >/dev/null  || { echo "❌ 缺少 tauri-cli，执行: cargo install tauri-cli --version '^2'"; exit 1; }
	@echo "✅ 工具链齐全"
	@node -v && go version && rustc --version && tauri --version

# ============ 开发运行 ============

.PHONY: dev
dev: ## 桌面端开发（sidecar 编译 + vite + tauri 窗口）
	npm run tauri dev

.PHONY: dev-web
dev-web: ## 浏览器调试前端（自动起 sidecar + Vite，退出时一并结束）
	@mkdir -p $(DATA_DIR)
	@trap 'kill 0' EXIT INT TERM; \
	cd server && go run . --port $(PORT) --data-dir $(DATA_DIR) --dev & \
	SIDECAR_PID=$$!; \
	for i in $$(seq 1 30); do curl -sf http://127.0.0.1:$(PORT)/health >/dev/null 2>&1 && break; sleep 0.5; done ; \
	npm run dev

.PHONY: run-sidecar
run-sidecar: ## 单独运行 Go sidecar（端口 PORT，默认 17877）
	@mkdir -p $(DATA_DIR)
	@cd server && go run . --port $(PORT) --data-dir $(DATA_DIR) --dev

# ============ 构建 ============

.PHONY: build
build: ## 打包桌面应用（自动包含 sidecar 构建）
	npm run tauri build

# macOS Apple Silicon (M1/M2/M3) 本地安装包目标架构
MACOS_ARM_TARGET ?= aarch64-apple-darwin

.PHONY: build-macos-m1
build-macos-m1: ## 本地打包 macOS M1 安装包（ad-hoc 签名，便于本机测试）
	@command -v rustup >/dev/null || { echo "❌ 缺少 rustup"; exit 1; }
	@rustup target list --installed | grep -q '^$(MACOS_ARM_TARGET)$$' \
		|| rustup target add $(MACOS_ARM_TARGET)
	@echo "==> 构建 Go sidecar ($(MACOS_ARM_TARGET))"
	bash scripts/build-sidecar.sh $(MACOS_ARM_TARGET)
	@echo "==> 构建 Tauri 安装包 ($(MACOS_ARM_TARGET)，ad-hoc 签名)"
	TAURI_ENV_TARGET_TRIPLE=$(MACOS_ARM_TARGET) APPLE_SIGNING_IDENTITY=- \
		npx tauri build --target $(MACOS_ARM_TARGET)
	@echo "✅ 打包完成，产物位于：src-tauri/target/$(MACOS_ARM_TARGET)/release/bundle/"
	@find src-tauri/target/$(MACOS_ARM_TARGET)/release/bundle -maxdepth 3 \
		\( -name '*.dmg' -o -name '*.app' \) -print | sed 's/^/   /'

.PHONY: sidecar
sidecar: ## 仅构建 Go sidecar（可传 TARGET=aarch64-apple-darwin 等）
	bash scripts/build-sidecar.sh $(TARGET)

.PHONY: frontend
frontend: ## 仅构建前端 dist/
	npm run build

# ============ 质量 ============

.PHONY: check
check: server-check frontend-check ## 全部质量检查（Go vet/build + 前端 build）

.PHONY: server-check
server-check: ## Go 侧检查：go vet + go build
	@cd server && go vet ./... && go build -o /dev/null . && echo "✅ Go 检查通过"

.PHONY: frontend-check
frontend-check: ## 前端检查：vite build
	@npm run build >/dev/null 2>&1 && echo "✅ 前端构建通过"

.PHONY: server-fmt
server-fmt: ## Go 代码格式化
	@cd server && gofmt -l -w . && echo "✅ 格式化完成"

# ============ 数据/清理 ============

.PHONY: clean
clean: clean-db clean-dist ## 清理构建产物 + 本地数据库（慎用）
	@rm -rf src-tauri/target && echo "✅ Rust 构建缓存已清理"

.PHONY: clean-db
clean-db: ## 删除本地开发数据库（sidecar 默认目录）
	@rm -f server/leetcode_note.db server/leetcode_note.db-* && echo "✅ 开发数据库已删除"

.PHONY: clean-dist
clean-dist: ## 删除前端构建产物
	@rm -rf dist && echo "✅ dist 已删除"

# ============ 帮助 ============

.PHONY: help
help: ## 显示所有可用命令
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / \
		{ printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 } \
		/^# =+/ { getline; print "\n" $$0 }' $(MAKEFILE_LIST)
