#!/usr/bin/env bash
# 编译 Go sidecar 二进制到 src-tauri/binaries/{name}-{target-triple}
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT/server"
OUT_DIR="$ROOT/src-tauri/binaries"
NAME="leetcode-note-server"
LDFLAGS="-s -w"

mkdir -p "$OUT_DIR"

# 探测当前 Rust target triple（优先 cargo rustc -vV）
detect_triple() {
  if command -v rustc >/dev/null 2>&1; then
    local host
    host=$(rustc -vV 2>/dev/null | awk '/^host:/ {print $2}')
    if [ -n "$host" ]; then
      echo "$host"
      return
    fi
  fi
  echo ""
}

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  TARGET="${TAURI_ENV_TARGET_TRIPLE:-${CARGO_BUILD_TARGET:-}}"
fi
if [ -z "$TARGET" ]; then
  TARGET=$(detect_triple)
fi

if [ -z "$TARGET" ]; then
  echo "[sidecar] 未能检测到 target triple，请传入参数，例如: $0 aarch64-apple-darwin"
  exit 1
fi

# Rust triple -> Go GOOS/GOARCH
case "$TARGET" in
  aarch64-apple-darwin)   GOOS=darwin GOARCH=arm64 ;;
  x86_64-apple-darwin)    GOOS=darwin GOARCH=amd64 ;;
  x86_64-pc-windows-msvc|x86_64-pc-windows-gnu) GOOS=windows GOARCH=amd64 ;;
  aarch64-pc-windows-msvc) GOOS=windows GOARCH=arm64 ;;
  x86_64-unknown-linux-gnu) GOOS=linux GOARCH=amd64 ;;
  aarch64-unknown-linux-gnu) GOOS=linux GOARCH=arm64 ;;
  *) echo "[sidecar] 未知的 target triple: $TARGET"; exit 1 ;;
esac

EXT=""
[ "$GOOS" = "windows" ] && EXT=".exe"

echo "[sidecar] GOOS=$GOOS GOARCH=$GOARCH -> $NAME-$TARGET$EXT"
(cd "$SERVER_DIR" && CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" go build -trimpath -ldflags "$LDFLAGS" -o "$OUT_DIR/$NAME-$TARGET$EXT" .)

echo "[sidecar] 构建完成: $OUT_DIR/$NAME-$TARGET$EXT"
