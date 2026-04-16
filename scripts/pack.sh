#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACK_DIR="$ROOT_DIR/dist-pack"
VERSION="0.1.0"

# 清理旧的 tarball
rm -rf "$PACK_DIR"
mkdir -p "$PACK_DIR"

# 构建
echo "==> Building all packages..."
pnpm run build

# 打包每个子包，替换 workspace:* 为实际版本号
for pkg in core mcp-server cli; do
  PKG_DIR="$ROOT_DIR/packages/$pkg"
  TMP_DIR=$(mktemp -d)

  echo "==> Packing @mybad/$pkg..."

  # 复制 dist 目录到临时目录
  cp -r "$PKG_DIR/dist" "$TMP_DIR/dist"

  # 复制 package.json，替换 workspace:* 为实际版本号
  if [ -f "$PKG_DIR/package.json" ]; then
    sed 's/"workspace:\*"/"'"$VERSION"'"/g' "$PKG_DIR/package.json" > "$TMP_DIR/package.json"
  fi

  # 复制 README（如果有）
  [ -f "$PKG_DIR/README.md" ] && cp "$PKG_DIR/README.md" "$TMP_DIR/"

  # 在临时目录打包
  (cd "$TMP_DIR" && npm pack --pack-destination "$PACK_DIR" 2>/dev/null)

  # 清理临时目录
  rm -rf "$TMP_DIR"
done

# 重命名为统一名称
mv "$PACK_DIR/mybad-core-$VERSION.tgz" "$PACK_DIR/mybad-core-$VERSION.tgz" 2>/dev/null || true
mv "$PACK_DIR/mybad-mcp-server-$VERSION.tgz" "$PACK_DIR/mybad-mcp-server-$VERSION.tgz" 2>/dev/null || true
mv "$PACK_DIR/mybad-cli-$VERSION.tgz" "$PACK_DIR/mybad-cli-$VERSION.tgz" 2>/dev/null || true

echo ""
echo "==> Pack complete! Files in $PACK_DIR:"
ls -lh "$PACK_DIR"/*.tgz

# 验证包内容
echo ""
echo "==> Verifying package contents..."
for tgz in "$PACK_DIR"/*.tgz; do
  echo ""
  echo "--- $(basename "$tgz") ---"
  tar tzf "$tgz" | head -20
done

# 验证 workspace:* 已被替换
echo ""
echo "==> Checking workspace protocol..."
for tgz in "$PACK_DIR"/*.tgz; do
  if tar xzf "$tgz" -O --include='*/package.json' 2>/dev/null | grep -q 'workspace:'; then
    echo "FAIL: $(basename "$tgz") still contains workspace: protocol!"
    exit 1
  fi
done
echo "OK: No workspace: protocol found in any tarball."
