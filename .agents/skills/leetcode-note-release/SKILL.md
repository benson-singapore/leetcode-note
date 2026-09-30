---
name: leetcode-note-release
description: 为 LeetCode Note 编排桌面端版本发布：确认版本、生成更新日志、同步版本文件、提交并推送 tag，监控 GitHub Actions 为 macOS、Windows、Linux 构建并发布安装包。适用于“发布版本”“打包发布”“发到 GitHub Releases”等请求。
---

# LeetCode Note release

负责发布编排。GitHub Actions 在推送 `v*` tag 后，自动为 macOS Apple Silicon/Intel、Windows x64、Linux x64 构建并上传安装包。

## 规则

1. 在改版本文件、提交、创建/移动 tag 或 push 之前，读取 `src-tauri/tauri.conf.json` 的当前版本、`git tag --sort=-v:refname` 的最新 tag 和 `git status`，向用户展示并确认目标版本。绝不静默递增版本。
2. 如果目标版本 tag 已存在，“重建/替换”会移动远端 tag 并更新 Release 资产，必须单独获得用户对该 tag 替换的明确确认。普通新版本确认不包含重建授权。
3. 工作区若有未提交改动，先列明并请用户提交或 stash；不要把无关文件纳入发布提交。
4. 默认分支是 `master`。核对本仓库默认分支与 `origin`，如不符先按真实仓库调整发布步骤，不能将 tag 推到错误分支。

## 版本契约

以下三个文件必须同步为 `X.Y.Z`（不带 `v`）：

- `src-tauri/tauri.conf.json`：`version`
- `src-tauri/Cargo.toml`：`[package].version`
- 根目录 `package.json`：`version`

本仓库没有独立 `frontend/package.json`。tag 与 GitHub Release 使用 `vX.Y.Z`。

## 首次发布准备

真实工作流位于 `.github/workflows/release.yml`。若工作流不存在，把 `.agents/skills/leetcode-note-release/assets/release.yml` 复制过去并检查后再提交。仓库 Actions 权限需允许 `contents: write`；工作流使用内置 `github.token`，无需新建 secret。

## 发布步骤

1. 完成上面的版本确认和工作区检查。
2. 阅读 `.agents/skills/release-notes/SKILL.md`，运行只读取证脚本生成计划范围：

   ```bash
   .agents/skills/release-notes/scripts/git-release-context.sh \
     --target-tag "vX.Y.Z" \
     --from-tag "$(git tag --sort=-v:refname | head -n 1)"
   ```

   若没有历史 tag，省略 `--from-tag`，按首发处理。基于证据创建 `docs/update/vX.Y.Z.md`。日志先于 tag 提交；Actions 将其直接用作 Release 正文。运行尚未完成时，只能写预期平台和产物，不能声称构建成功。
3. 同步三个版本文件。检查 diff 和日志，再单次提交版本文件、更新日志及新增工作流。
4. 推送 `master`，创建并推送新 tag：

   ```bash
   git push origin master
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   仅在用户明确确认替换已有 tag 后，才能执行移动/删除远端 tag 的操作。
5. 用 `gh run list --limit 5` 找到该 tag 对应的 run，执行 `gh run watch <run-id> --exit-status`。失败时读 `gh run view <run-id> --log-failed` 并提交修复；不能把失败称为发布成功。
6. run 成功后核验：所有平台 job 成功；Release `vX.Y.Z` 存在且不是 draft；正文与 `docs/update/vX.Y.Z.md` 一致；附件至少包含 macOS `.dmg`、Windows `.msi`/`.exe`、Linux `.AppImage`/`.deb`/`.rpm`；本地 `master` 与 `origin/master` 同步。只有逐项核实后才能宣告完成。

## 平台目标

- macOS：`aarch64-apple-darwin` 与 `x86_64-apple-darwin`，输出 DMG。
- Windows：`x86_64-pc-windows-msvc`，输出 MSI 和 NSIS EXE。
- Linux：`x86_64-unknown-linux-gnu`，输出 AppImage、DEB、RPM。
- 每个 bundle 都包含对应 target triple 的 Go sidecar。Tauri 的构建前置命令会再次执行 `scripts/build-sidecar.sh`；目标由 `TAURI_ENV_TARGET_TRIPLE` 指定，脚本不得退回宿主架构。
