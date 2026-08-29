#!/usr/bin/env bash
# ============================================================
# Stordex Staging オペレーションスクリプト
# ------------------------------------------------------------
# 用途: ローカル PC から Staging (Neon DB + Vercel) を準備・操作する。
#
# ※ Staging アプリの「デプロイ」自体は GitHub Actions
#   (.github/workflows/deploy-staging.yml) が `develop` ブランチへの
#   push をトリガに自動で行うため、このスクリプトはそれを補助する役割。
#
# 必要環境:
#   - Node.js 22
#   - Neon にプロジェクトを作成済み
#   - .env.staging が存在し、DATABASE_URL/NEXTAUTH_SECRET/NEXTAUTH_URL
#     が記入されていること（テンプレート: .env.staging.example）
#
# 使い方:
#   ./scripts/start-staging.sh                # Migration反映＋Seed＋接続確認
#   ./scripts/start-staging.sh --schema       # committed migration反映のみ
#   ./scripts/start-staging.sh --seed         # 初期データ投入のみ
#   ./scripts/start-staging.sh --studio       # Prisma Studio で staging DB を開く
#   ./scripts/start-staging.sh --deploy       # develop ブランチに push して
#                                             # GitHub Actions の Vercel deploy をトリガ
#   ./scripts/start-staging.sh --status       # CI / 直近 deploy の状態を表示
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT_DIR="$(pwd)"
echo "📂 Working dir: $ROOT_DIR"

ENV_FILE=".env.staging"
DO_SCHEMA=true
DO_SEED=true
DO_STUDIO=false
DO_DEPLOY=false
DO_STATUS=false

if [ "$#" -gt 0 ]; then
  DO_SCHEMA=false
  DO_SEED=false
  for arg in "$@"; do
    case "$arg" in
      --schema)  DO_SCHEMA=true ;;
      --seed)    DO_SEED=true ;;
      --studio)  DO_STUDIO=true ;;
      --deploy)  DO_DEPLOY=true ;;
      --status)  DO_STATUS=true ;;
      -h|--help)
        grep '^#' "$0" | sed 's/^# \{0,1\}//'
        exit 0
        ;;
      *)
        echo "❌ Unknown option: $arg" >&2
        exit 1
        ;;
    esac
  done
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE が見つかりません。" >&2
  echo "   .env.staging.example をコピーして実値を入れてください:" >&2
  echo "     cp .env.staging.example $ENV_FILE" >&2
  exit 1
fi

if ! grep -qE '^DATABASE_URL=.+(neon|staging)' "$ENV_FILE"; then
  echo "⚠️  $ENV_FILE の DATABASE_URL が Neon/Staging を指しているか確認してください。"
fi

if [ ! -d node_modules ]; then
  echo "📦 npm ci"
  npm ci
fi

# --- 2. Migration反映 ---
if [ "$DO_SCHEMA" = true ]; then
  echo "🗄️  Staging DB に committed migrations を反映 (prisma migrate deploy)"
  npm run db:migrate:staging
fi

# --- 3. Seed (Tenant が無ければ投入) ---
if [ "$DO_SEED" = true ]; then
  echo "🌱 Staging DB に Seed 投入 (既存テナントはスキップ)"
  npm run db:seed:staging
fi

# --- 4. Prisma Studio で staging DB をブラウズ ---
if [ "$DO_STUDIO" = true ]; then
  echo "🔍 Prisma Studio を起動 (Ctrl+C で終了)"
  npm run db:studio:staging
fi

# --- 5. develop へ push して GitHub Actions の Vercel deploy をトリガ ---
if [ "$DO_DEPLOY" = true ]; then
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  echo "🚀 develop ブランチに push して Staging deploy を起動"
  if [ -n "$(git status --porcelain)" ]; then
    echo "❌ 未コミットの変更があります。先に commit してください。" >&2
    git status --short
    exit 1
  fi
  if [ "$CURRENT_BRANCH" = "develop" ]; then
    git push origin develop
  else
    echo "ℹ️  現在のブランチ: $CURRENT_BRANCH"
    echo "   $CURRENT_BRANCH の内容を develop に反映します"
    git push origin "$CURRENT_BRANCH:develop"
  fi
  echo ""
  echo "✅ push 完了。GitHub Actions の進捗:"
  if command -v gh >/dev/null 2>&1; then
    sleep 3
    gh run list --workflow=deploy-staging.yml --limit 1
    echo "   ログ表示: gh run view --log"
  else
    echo "   https://github.com/Jun-engineer/stordex/actions/workflows/deploy-staging.yml"
  fi
fi

# --- 6. 直近の Staging CI 状態 ---
if [ "$DO_STATUS" = true ]; then
  if command -v gh >/dev/null 2>&1; then
    echo "📋 直近の deploy-staging 実行:"
    gh run list --workflow=deploy-staging.yml --limit 5
  else
    echo "ℹ️  gh CLI 未導入。 'brew install gh' で導入できます。"
    echo "   または https://github.com/Jun-engineer/stordex/actions"
  fi
fi

echo ""
echo "============================================================"
echo " ✅ Staging オペレーション完了"
echo " Vercel URL は GitHub Actions のサマリー、または"
echo " https://vercel.com/<your-team>/stordex で確認してください。"
echo "============================================================"
