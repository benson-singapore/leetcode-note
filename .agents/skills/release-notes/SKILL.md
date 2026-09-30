---
name: release-notes
description: 检查或生成基于 Git tag 和 commit 证据的版本更新日志。适用于“检查更新日志”“补更新日志”“写版本日志”等请求；只负责日志，不执行发布。
---

# Release notes

用于审计和编写 `docs/update/<tag>.md`。日志内容必须能从仓库 Git 历史中核实。

## 模式

- **Check**：用户要求检查/审计时，运行 `git tag --sort=-v:refname` 并列出 `docs/update/`。报告每个 tag 的同名笔记是否存在、文件名是否精确匹配，以及最新 tag 是否缺少笔记。不要修改文件；说明缺项并询问是否生成。
- **Generate**：用户要求生成或更新指定 tag 的日志时，先读取本文件并运行下面的只读取证脚本。仅使用脚本输出和仓库文件作为事实来源。

## 取证

```bash
# 已存在的 tag
.agents/skills/release-notes/scripts/git-release-context.sh --tag v0.2.0

# 尚未打 tag 的计划版本
.agents/skills/release-notes/scripts/git-release-context.sh \
  --target-tag v0.2.0 \
  --from-tag "$(git tag --sort=-v:refname | head -n 1)"
```

脚本只读，输出 `KEY=value`、`[COMMITS]` 和 `[STAT]` 区块。首发时没有 `--from-tag`，范围为全部可达历史。若范围没有 commit，明确写出没有可归纳的提交，不推断功能。

## 日志格式

写入 `docs/update/<tag>.md`，文件名必须与 tag 完全相同，例如 `docs/update/v0.1.0.md`。默认使用中文，包含以下章节：

```markdown
# <tag>

## 版本
## 发布时间
## 概述
## 新功能与变更
## 修复
## 构建与发布说明
## 来源范围
```

- 版本、tag、范围、日期来自脚本输出。计划版本日期可使用生成当天日期，并不得冒充 tag 日期。
- `feat(scope):` 可归类为新功能，`fix:` 可归类为修复；其他提交按实际内容放入变更。读取相关 diff 以理解提交，勿只凭模糊标题补充细节。
- 不得编造功能、修复、测试或构建结果。Actions 尚未完成时，只能描述预期产物，不能声称构建成功。
- “来源范围”保留起止 tag/range 和相关 commit 短 hash，便于审计。
- 构建平台和安装包格式按仓库实际的 `.github/workflows/release.yml` 描述。
