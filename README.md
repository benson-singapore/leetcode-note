# LeetCode 学习笔记（Tauri2 桌面应用）

本地优先的 LeetCode 学习笔记应用：题库管理、复习看板、AI 问答、油猴脚本数据同步，全部数据保存在本地 SQLite。

## 架构

| 层 | 技术 | 职责 |
|---|---|---|
| 前端 | React 18 + Vite（Tauri2 WebView 渲染） | 题库列表、复习看板、AI 问答、HTML 题解的 iframe 沙箱渲染 |
| 桌面壳 | Tauri2 | 打包分发、窗口管理、拉起/管理 Go sidecar 进程、系统托盘 |
| 后端 | Go（Tauri sidecar 二进制） | 本地 HTTP Server（收油猴脚本数据 + 供前端调用）、SQLite 读写、AI Provider 路由 |
| 数据 | SQLite（modernc.org/sqlite 纯 Go 驱动，免 CGO） | 题目、提交记录、复习状态、AI 会话记录 |
| AI 接入 | 官方 SDK（Anthropic/OpenAI）+ CLI 子进程封装 | 统一 `Provider` 接口，按用户设置切换后端，SSE 流式输出 |

```
┌───────────────────────────────┐
│ Tauri2 (Rust)                 │
│  窗口 / 托盘 / sidecar 管理    │
│  ┌─────────────────────────┐  │
│  │ React WebView (src/)    │  │
│  │ 题库 / 看板 / AI / 设置  │  │
│  └───────────┬─────────────┘  │
│              │ HTTP 127.0.0.1 │
│  ┌───────────▼─────────────┐  │
│  │ Go sidecar (server/)    │  │
│  │ /api/v1 REST + SSE      │  │
│  │ SQLite + LeetCode 爬虫  │  │
│  │ AI Provider 路由        │  │
│  └─────────────────────────┘  │
└───────────────────────────────┘
        ▲
        │ GM_xmlhttpRequest（免鉴权）
┌───────┴───────────────┐
│ 油猴脚本 (leetCode.cn)│
│ 笔记抽屉 → save-v2    │
└───────────────────────┘
```

## 目录结构

```
├── src/                  # React 前端
│   ├── api/              # HTTP / SSE 客户端
│   ├── pages/            # Dashboard / Problems / ProblemDetail / AIChat / Settings
│   └── App.jsx           # 布局与路由
├── src-tauri/            # Tauri2 Rust 壳
│   ├── src/main.rs       # 窗口 / 托盘 / sidecar 启停
│   ├── binaries/         # 构建产物：Go sidecar 二进制（带 target triple 后缀）
│   └── tauri.conf.json
├── server/               # Go sidecar（由旧项目 leetcode-note-web back-end 迁移）
│   ├── config/           # SQLite 初始化（内嵌 schema.sql）+ settings KV
│   ├── controller/       # problems / user-problems / reviews / tags / leetcode / settings / ai
│   ├── service/
│   │   └── ai/           # AI Provider：openai / anthropic / cli + 会话持久化
│   ├── repository/       # 裸 SQL 数据访问（无 ORM）
│   └── routes/routes.go
├── scripts/build-sidecar.sh  # Go 交叉编译到 src-tauri/binaries/
└── docs/                 # 架构文档
```

## 与旧项目（leetcode-note-web）的差异

- 去除登录/鉴权：本地应用，所有 API 仅监听 `127.0.0.1`；`users` 表移除，改为 `settings` KV 表
- SQLite 驱动从 `mattn/go-sqlite3`（CGO）换成 `modernc.org/sqlite`（纯 Go，免 CGO 跨平台编译）
- 侧车化：schema.sql 以 `go:embed` 内嵌；数据目录由 Tauri 传入（`--data-dir`），存放在系统应用数据目录
- 新增 AI 模块：统一 `Provider` 接口（OpenAI 官方 SDK / Anthropic 官方 SDK / CLI 子进程封装），SSE 流式对话，会话与消息持久化
- 移除 Playwright 爬虫端点（桌面端沿用 GraphQL 抓取 + 用户 Cookie）

## 开发

```bash
# 1. 安装前端依赖
npm install

# 2. 桌面端开发（自动：编译 sidecar → vite dev → cargo build → 启动应用）
npm run tauri dev

# 仅浏览器调试前端（需要 sidecar 在 17877 运行）
npm run sidecar:run   # 终端 A
npm run dev           # 终端 B（Vite 代理 /api → 17877）
```

## 构建

```bash
npm run tauri build        # 打包桌面应用（自动包含 sidecar 构建）
bash scripts/build-sidecar.sh [target-triple]   # 单独构建 sidecar
```

## 油猴脚本

沿用旧项目 `tamper-monkey/leetcode-note-drawer.user.js`，将后端地址指向 `http://127.0.0.1:17877/api/v1` 即可。
