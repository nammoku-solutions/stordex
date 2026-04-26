# 環境構成（Local / Staging / Production）

3 段階の環境を使い分けて、ローカル動作確認 → インターネット動作確認 → 本番リリース、と段階的に進めます。

| 環境 | 用途 | DB | アプリホスト | URL 例 | コスト |
|---|---|---|---|---|---|
| **Local** | 開発・単体/結合/機能テスト | PostgreSQL 16 (ローカル / Docker) | `next dev` | http://localhost:3000 | ¥0 |
| **Staging** | クライアント確認・総合テスト | **Neon** (無料枠 0.5GB) | **Vercel Hobby** | https://stordex-dev.vercel.app | ¥0 |
| **Production** | 本番運用 | **Aurora Serverless v2** (VPC) | **Lambda + CloudFront** (SST) | https://app.example.com | ¥10,000+/月 |

ブランチ運用例：
- `feature/*` → ローカルでテスト
- `develop` → push で Vercel が Preview デプロイ → Staging で確認
- `main` → `npx sst deploy --stage prod` で Production 反映

---

## 0. 環境変数の運用方針（重要）

**結論: 環境ごとに別ファイル（`.env.local` / `.env.staging` / `.env.prod`）に分け、変数名は同じ (`DATABASE_URL` 等) に統一する。**

### 理由
- アプリのコードに「環境ごとに参照する変数を変える」分岐が要らない
- Next.js は `.env.local` を `next dev`/`next build` 時に **自動読み込み**（標準仕様）
- 本番値は Vercel / SST の **シークレットマネージャ側** に設定し、ローカルファイルには **絶対に置かない**
- `.env.staging` と `.env.prod` は **「ローカル PC から DB を直接操作する時だけ使う」** 補助ファイル

### ファイルとロード機構

| ファイル | コミット | 用途 | 読み込み方 |
|---|---|---|---|
| `.env.example` | ✅ する | local 用テンプレート | 手動コピー |
| `.env.staging.example` | ✅ する | staging 用テンプレート | 手動コピー |
| `.env.prod.example` | ✅ する | prod 用テンプレート | 手動コピー |
| `.env.local` | ❌ しない | ローカル開発の実値 | `next dev`/`next build` が自動 |
| `.env.staging` | ❌ しない | ローカル → Neon 操作用 | `dotenv -e .env.staging` |
| `.env.prod` | ❌ しない | ローカル → Aurora 操作用 | `dotenv -e .env.prod` |
| Vercel Env Vars | — | staging アプリ実行時 | Vercel が自動注入 |
| SST Secrets | — | prod アプリ実行時 | Lambda に自動注入 |

### 初回セットアップ
```bash
cp .env.example          .env.local       # 編集して実値を入れる
cp .env.staging.example  .env.staging     # 必要時のみ
cp .env.prod.example     .env.prod        # 必要時のみ
```

### 使い分け（運用時に編集不要）

| 操作 | コマンド | 読まれるファイル |
|---|---|---|
| ローカル dev | `npm run dev` | `.env.local` |
| ローカル DB スキーマ反映 | `npm run db:push` | `.env.local` |
| Staging DB スキーマ反映 | `npm run db:push:staging` | `.env.staging` |
| Staging DB Seed | `npm run db:seed:staging` | `.env.staging` |
| Staging DB Studio | `npm run db:studio:staging` | `.env.staging` |
| Prod DB スキーマ反映（要バックアップ） | `npm run db:push:prod` | `.env.prod` |
| 本番アプリデプロイ | `npx sst deploy --stage prod` | SST Secrets |

→ **`DATABASE_URL` を手で書き換える必要は一切ありません。**

---

## 1. Local 環境

### 1-1. 前提
- Node.js 20+
- PostgreSQL 16（`brew install postgresql@16` または Docker）

### 1-2. セットアップ

```bash
# リポジトリ直下で実行（original-app/ ではない）

# DB 起動（Docker の場合）
docker run -d --name stordex-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=stordex -e POSTGRES_USER=stordex -e POSTGRES_DB=stordex \
  postgres:16

# .env.local 作成（Next.js が自動で読み込む）
cat > .env.local <<EOF
DATABASE_URL="postgresql://stordex:stordex@localhost:5432/stordex?schema=public"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:3000"
APP_ENV="local"
EOF

# 依存・スキーマ・シード
npm install
npm run db:push
npm run db:seed

# 起動
npm run dev
```

ブラウザ: http://localhost:3000  
シードで作成されるデモログインは `prisma/seed.ts` を参照。

### 1-3. ローカルで実行できるテスト
- `npm run typecheck` — 型チェック
- `npm test` — 単体テスト (Vitest)
- `npm run lint` — Lint
- 機能テスト（手動）→ `TEST_CASES.md` のチェックリストに従う

---

## 2. Staging 環境（Neon + Vercel）

### 2-1. Neon セットアップ
1. https://neon.tech にサインアップ
2. Project 作成 → Region: **Asia Pacific (Tokyo)** / Postgres 16
3. 接続文字列をコピー（`postgresql://...neon.tech/neondb?sslmode=require`）

### 2-2. Vercel セットアップ
1. https://vercel.com でリポジトリをインポート
2. **Root Directory** を `web-app` に指定
3. Environment Variables（**Production / Preview / Development** すべてに）:
   - `DATABASE_URL` = Neon 接続文字列
   - `NEXTAUTH_SECRET` = `openssl rand -base64 32` の出力
   - `NEXTAUTH_URL` = `https://<vercel-project-name>.vercel.app`（初回 deploy 後に正式 URL で上書き）
   - `APP_ENV` = `staging`
4. Deploy

### 2-3. 初期データ投入

```bash
# ローカルから Neon に対してマイグレーション + シード
DATABASE_URL="<Neon URL>" npx prisma db push
DATABASE_URL="<Neon URL>" npm run db:seed
```

### 2-4. クライアント共有
発行された URL（例 `https://stordex-dev.vercel.app`）をクライアントに共有。

---

## 3. Production 環境（AWS Aurora + Lambda）

詳細は [AWS_DEPLOY.md](AWS_DEPLOY.md) を参照。

```bash
npx sst secret set NextAuthSecret "$(openssl rand -base64 32)" --stage prod
npx sst secret set NextAuthUrl    "https://example.invalid"    --stage prod
npx sst deploy --stage prod
# → CloudFront URL を NEXTAUTH_URL に上書き → 再 deploy
```

DB マイグレーションは VPC 内 Aurora に対して SSM ポートフォワード経由（AWS_DEPLOY.md §5）。

---

## 環境切替チェックリスト

| 項目 | Local | Staging | Production |
|---|---|---|---|
| `DATABASE_URL` | localhost | Neon URL | Aurora（SST 自動注入） |
| `NEXTAUTH_URL` | http://localhost:3000 | Vercel URL | CloudFront / カスタムドメイン |
| `NEXTAUTH_SECRET` | 任意 | 32byte ランダム | 32byte ランダム（SST シークレット） |
| エラー詳細表示 | あり | あり (preview) | なし |
| ログ送信先 | コンソール | Vercel Logs | CloudWatch Logs |
| バックアップ | 不要 | Neon 自動 (7d) | Aurora 自動 (PITR) |
