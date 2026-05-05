#!/usr/bin/env bash
# ============================================================
# Stordex ローカル起動スクリプト
# ------------------------------------------------------------
# 用途: 開発者のローカル PC で Stordex を起動するための one-shot スクリプト
# 必要環境:
#   - macOS (Homebrew)
#   - Node.js 20 以上
#   - PostgreSQL 16 (Homebrew でインストール済み)
#
# 使い方:
#   ./scripts/start-local.sh             # 通常起動 (DB 既存ならそのまま)
#   ./scripts/start-local.sh --reset     # DB を作り直してから起動
#   ./scripts/start-local.sh --no-dev    # DB 準備のみ (npm run dev は起動しない)
# ============================================================
set -euo pipefail

# --- 0. 必ずこのスクリプトのあるディレクトリ (= リポジトリ直下) で実行 ---
cd "$(dirname "$0")/.."
ROOT_DIR="$(pwd)"
echo "📂 Working dir: $ROOT_DIR"

RESET=false
START_DEV=true
for arg in "$@"; do
  case "$arg" in
    --reset)   RESET=true ;;
    --no-dev)  START_DEV=false ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

# --- 1. PostgreSQL の起動確認 ---
echo "🐘 PostgreSQL を確認..."
if ! command -v psql >/dev/null 2>&1; then
  echo "❌ psql が見つかりません。 'brew install postgresql@16' を実行してください。" >&2
  exit 1
fi

# 既に起動していれば何もしない。未起動なら brew services で起動を試み、
# 失敗した場合は pg_ctl で直接起動する。
if ! psql -U "$USER" -d postgres -c '\q' >/dev/null 2>&1; then
  echo "   起動していないため起動します..."
  STARTED=false
  if command -v brew >/dev/null 2>&1; then
    if brew services start postgresql@16 >/dev/null 2>&1; then
      STARTED=true
    fi
  fi
  if [ "$STARTED" = false ]; then
    PG_BIN="$(brew --prefix postgresql@16 2>/dev/null)/bin"
    PGDATA_DIR="$(brew --prefix 2>/dev/null)/var/postgresql@16"
    if [ -x "$PG_BIN/pg_ctl" ] && [ -d "$PGDATA_DIR" ]; then
      "$PG_BIN/pg_ctl" -D "$PGDATA_DIR" -l "$PGDATA_DIR/server.log" start >/dev/null 2>&1 || true
    fi
  fi
fi

# 接続できるまで最大 15 秒待つ
CONNECTED=false
for i in {1..15}; do
  if psql -U "$USER" -d postgres -c '\q' >/dev/null 2>&1; then
    CONNECTED=true
    break
  fi
  sleep 1
done
if [ "$CONNECTED" = false ]; then
  echo "❌ PostgreSQL に接続できません。手動で 'brew services start postgresql@16' を試してください。" >&2
  exit 1
fi
echo "✅ PostgreSQL 起動済み"

# --- 2. データベースの準備 ---
DB_NAME="stordex_dev"
if [ "$RESET" = true ]; then
  echo "♻️  DB を作り直します ($DB_NAME)"
  dropdb --if-exists "$DB_NAME"
fi

if ! psql -U "$USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo "🆕 データベース $DB_NAME を作成"
  createdb "$DB_NAME"
else
  echo "✅ データベース $DB_NAME 既存"
fi

# --- 3. .env を生成 (存在しない場合のみ) ---
if [ ! -f .env ]; then
  echo "📝 .env を生成"
  SECRET="$(openssl rand -base64 32)"
  cat > .env <<EOF
DATABASE_URL="postgresql://$USER@localhost:5432/$DB_NAME?schema=public"
NEXTAUTH_SECRET="$SECRET"
NEXTAUTH_URL="http://localhost:3000"
APP_ENV="local"
EOF
else
  echo "✅ .env 既存 (上書きしません)"
fi

# --- 4. 依存インストール (node_modules が無い場合のみ) ---
if [ ! -d node_modules ]; then
  echo "📦 npm install"
  npm install
else
  echo "✅ node_modules 既存"
fi

# --- 5. Prisma で schema を DB に適用 ---
echo "🗄️  prisma db push"
npm run db:push

# --- 6. Seed (テナントが無ければ投入) ---
HAS_TENANT=$(psql -U "$USER" -d "$DB_NAME" -tAc "SELECT 1 FROM \"Tenant\" LIMIT 1;" 2>/dev/null || echo "")
if [ -z "$HAS_TENANT" ]; then
  echo "🌱 db:seed"
  npm run db:seed
else
  echo "✅ Seed 済み (Tenant あり)"
fi

# --- 7. 開発サーバ起動 ---
if [ "$START_DEV" = true ]; then
  echo ""
  echo "============================================================"
  echo " 🚀 Stordex を起動します"
  echo "    URL:      http://localhost:3000"
  echo "    ログイン: admin@example.com / password (テナント: demo)"
  echo "    停止:     Ctrl+C"
  echo "============================================================"
  npm run dev
else
  echo "✅ 準備完了 (--no-dev のため dev サーバは起動しません)"
fi
