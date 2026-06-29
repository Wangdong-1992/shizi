#!/usr/bin/env bash
#
# setup-env.sh
#
# 本地 .env.local 硬化 (P3-3 部署侧动作).
#
# 背景: .env.local 含 WX_APPSECRET / BAIDU_API_KEY / BAIDU_SECRET_KEY 明文,
#   虽然 .gitignore 已覆盖 (git 不会 commit), 但本机失窃/误传/备份都可能泄露.
#   部署推荐: CI/CD 注入 + 本地 .env.local 加 600 权限.
#
# 用法:
#   bash scripts/setup-env.sh
#
# 效果:
#   1. 检查 .env.local 是否存在, 没有则从 .env.local.example 复制
#   2. chmod 600 (仅 owner 可读写)
#   3. 打印当前权限, 提示密钥轮换

set -e

cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
EXAMPLE_FILE=".env.local.example"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$EXAMPLE_FILE" ]; then
    echo "⚠️  $ENV_FILE 不存在, 从 $EXAMPLE_FILE 复制..."
    cp "$EXAMPLE_FILE" "$ENV_FILE"
    echo "✅ 复制完成, 请填写真实密钥"
  else
    echo "❌  $ENV_FILE 和 $EXAMPLE_FILE 都不存在, 无法 setup"
    exit 1
  fi
fi

CURRENT_PERM=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")
echo "📋  $ENV_FILE 当前权限: $CURRENT_PERM"

if [ "$CURRENT_PERM" != "600" ]; then
  echo "🔒 收紧权限到 600 (仅 owner 可读写)..."
  chmod 600 "$ENV_FILE"
  echo "✅  权限已设为 600"
else
  echo "✅  权限已是 600"
fi

echo ""
echo "📝 部署建议:"
echo "  - 生产环境密钥不应在本地 .env.local, 应由 CI/CD 注入"
echo "  - 云函数环境变量在 WeChat 云开发控制台配置: 云函数 → main → 配置 → 环境变量"
echo "  - 旧密钥(从 git 历史泄露)已在 docs/CLAUDE.md 安全注意事项记录, 需要时去对应平台重置"
echo ""
echo "🔍  $ENV_FILE 内容 (用于检查是否需要填写):"
echo "---"
grep -E '^[A-Z_]+=' "$ENV_FILE" | sed 's/=.*/=***/' | head -10
echo "---"