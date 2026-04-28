# Stordex

物流・卸売業向けのマルチテナント受発注・在庫管理 SaaS。  
レガシーの Windows Forms C# アプリ（[original-app/](original-app/)）を Web アプリとして再構築したものです。

**所有・提供元**: Nammoku Solutions  
**サポート**: support@nammoku-solutions.com

## 目次

- [技術スタック](#技術スタック)
- [リポジトリ構成](#リポジトリ構成)
- [クイックスタート（ローカル）](#クイックスタートローカル)
- [3 段階の環境](#3-段階の環境)
- [テスト](#テスト)
- [CI / CD](#ci--cd)
- [デプロイ（AWS Aurora Serverless v2）](#デプロイaws-aurora-serverless-v2)
- [主要画面](#主要画面)
- [帳票印刷 / PDF](#帳票印刷--pdf)
- [CSV 取り込み / 外部サービス連携](#csv-取り込み--外部サービス連携)
- [レガシーアプリからの移行](#レガシーアプリからの移行)
- [マルチテナント設計](#マルチテナント設計)

## 技術スタック

- **Next.js 14** (App Router, React Server Components, Server Actions) + **TypeScript**
- **PostgreSQL** + **Prisma 5**
- **NextAuth.js** (Credentials, JWT セッション 8h)
- **Tailwind CSS**
- **Zod**（入力バリデーション）
- **Vitest**（単体テスト）
- **SST v3 (Ion) + OpenNext**（AWS デプロイ）
- **GitHub Actions**（CI / CD）

## リポジトリ構成

```
stordex/
├── src/                      Next.js アプリ (App Router)
├── prisma/                   schema.prisma + seed.ts
├── public/                   静的アセット
├── original-app/             旧 C# WinForms アプリ（参考用、ビルド成果物は .gitignore）
├── .github/workflows/        GitHub Actions（CI / CD）
├── sst.config.ts             AWS SST デプロイ設定
├── package.json
├── README.md                 本ファイル
├── USER_MANUAL.md            クライアント向け操作マニュアル
├── ENVIRONMENTS.md           環境別セットアップ
├── AWS_DEPLOY.md             AWS 本番デプロイ手順
├── BILLING.md                請求・入金・アカウント停止フロー
├── TEST_PLAN.md              テスト計画
└── TEST_CASES.md             テストケース集
```

> 2026/04 にアプリ本体を `web-app/` からリポジトリ直下に移動しました。`npm` コマンドはリポジトリ直下で実行してください。

## クイックスタート（ローカル）

### 1. 前提

- Node.js 20+
- PostgreSQL 16（`brew install postgresql@16` または Docker）

### 2. DB を起動

```bash
# Homebrew
brew services start postgresql@16
createdb stordex

# または Docker
docker run -d --name stordex-pg -p 5432:5432 \
  -e POSTGRES_USER=stordex -e POSTGRES_PASSWORD=stordex -e POSTGRES_DB=stordex \
  postgres:16
```

### 3. リポジトリ直下で セットアップ

> **重要:** `original-app/` ディレクトリには `package.json` がありません。必ず **リポジトリ直下** で実行してください。

#### 3-A. ワンショット起動スクリプト（推奨）

```bash
cd /path/to/stordex
./scripts/start-local.sh           # 通常起動 (.env / DB / seed をすべて自動)
./scripts/start-local.sh --reset   # DB をクリーンに作り直す
./scripts/start-local.sh --no-dev  # 準備のみ (dev サーバは起動しない)
```

スクリプトが自動で行うこと:
1. PostgreSQL 16 を起動
2. `stordex_dev` データベース作成
3. `.env` 生成（無い場合のみ／既存は上書きしない）
4. `npm install`
5. `prisma db push` でスキーマ反映
6. テナントが空なら `db:seed` 投入
7. `npm run dev` で `http://localhost:3000` を起動

#### 3-B. 手動セットアップ

```bash
cd /path/to/stordex     # ← リポジトリ直下！

# .env を作成
cat > .env <<EOF
DATABASE_URL="postgresql://$USER@localhost:5432/stordex_dev?schema=public"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:3000"
APP_ENV="local"
EOF

npm install
npm run db:push     # スキーマ反映
npm run db:seed     # デモテナント + サンプルデータ
npm run dev         # → http://localhost:3000
```

シードで投入される初期アカウント（**テナント分離テスト用に 2 社** 投入されます）：

| テナント | テナントID | メール | パスワード | 用途 |
| --- | --- | --- | --- | --- |
| デモ卸売株式会社 | `demo` | `admin@example.com` | `password` | 1社目 |
| ACME物流株式会社 | `acme` | `owner@acme.example.com` | `password` | 2社目（分離検証） |

> 2 社は商品コード `P001`/`P002`、顧客コード `C001`、仕入先コード `S001`、受注番号 `SO-20260101-0001` を意図的に重複させてあります。
> 同じコードでも別テナントでは完全に独立して管理されることを目視確認できます。

`NEXTAUTH_SECRET` の生成（Mac の openssl がない場合）：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 3 段階の環境

| 環境 | DB | アプリ | 用途 | コスト |
|---|---|---|---|---|
| **Local** | PostgreSQL 16 | `next dev` | 開発・単体/結合/機能テスト | ¥0 |
| **Staging** | Neon Free | Vercel Hobby | クライアント確認・総合テスト | ¥0 |
| **Production** | Aurora Serverless v2 | Lambda+CloudFront (SST) | 本番運用 | ¥10,000+/月 |

詳細は [ENVIRONMENTS.md](ENVIRONMENTS.md) を参照。

## テスト

| レベル | コマンド | 環境 |
|---|---|---|
| 型チェック | `npm run typecheck` | Local |
| 単体テスト (UT) | `npm test` | Local |
| 結合テスト (IT) | `npm test`（要 PG） | Local |
| 機能テスト (FT) | 手動（[TEST_CASES.md](TEST_CASES.md)） | Local |
| 総合テスト (ST/UAT) | 手動 | Staging |
| 本番 Smoke | 手動 | Production |

詳細は [TEST_PLAN.md](TEST_PLAN.md) と [TEST_CASES.md](TEST_CASES.md) を参照。

## CI / CD

GitHub Actions で以下を自動化しています（[.github/workflows/](.github/workflows/)）。

| ワークフロー | トリガ | 内容 |
|---|---|---|
| **ci.yml** | すべての push / PR | typecheck + unit/integration tests + build |
| **deploy-staging.yml** | `develop` ブランチへの push | Vercel に自動 staging デプロイ |
| **deploy-prod.yml** | `main` への push（手動承認） | SST で AWS Aurora + Lambda に本番デプロイ |

### 必要な GitHub Secrets

GitHub リポジトリ Settings → Secrets and variables → Actions に以下を登録：

| Secret 名 | 用途 |
|---|---|
| `VERCEL_TOKEN` | Vercel 自動デプロイ |
| `VERCEL_ORG_ID` | 同上 |
| `VERCEL_PROJECT_ID` | 同上 |
| `AWS_ACCESS_KEY_ID` | SST 本番デプロイ用 IAM |
| `AWS_SECRET_ACCESS_KEY` | 同上 |
| `AWS_REGION` | `ap-northeast-1` 等 |

## デプロイ（AWS Aurora Serverless v2）

```bash
npx sst secret set NextAuthSecret "$(openssl rand -base64 32)" --stage prod
npx sst secret set NextAuthUrl    "https://example.invalid"    --stage prod
npx sst deploy --stage prod
# → CloudFront URL を NEXTAUTH_URL に上書き → 再 deploy
```

詳細は [AWS_DEPLOY.md](AWS_DEPLOY.md) を参照。`DATABASE_URL` は SST が Aurora から自動注入するため、本番アプリでは手動設定不要です。

## 主要画面

| パス | 内容 |
|---|---|
| `/login` / `/signup` | ログイン / 新規テナント登録 |
| `/dashboard` | サマリー、最近の受注、在庫アラート |
| `/orders` | 受注一覧（本日受注 / 本日納品 / 翌日納品クイック絞り込み） |
| `/orders/[id]` | 受注詳細・状態遷移、納品書/ピッキング印刷 |
| `/quotations` | 見積書 CRUD・印刷 |
| `/purchase-orders` | 仕入先発注 CRUD・発注書印刷・入荷で在庫自動加算 |
| `/invoices` | 月次請求書（複数受注集約・伝票毎税/月次合算税の切替） |
| `/customers` / `/suppliers` / `/items` | マスタ CRUD |
| `/inventory` | 入出庫記録、ロット/賞味期限/棚番、移動履歴 |
| `/reports/products` | 商品別月次レポート（受注数 / 売上 / 粗利） |
| `/settings/business-units` | 事業所設定（請求書発行元、複数拠点対応） |
| `/settings/import` | **CSV 取り込み**（商品 / 得意先 / 仕入先 / 受注、プリセット + 列マッピング + ドライラン） |
| `/settings/import/history` | CSV 取り込み履歴・エラー行ダウンロード |
| `/settings/legacy-import` | 旧 C# アプリの XML 取り込み |
| `/print/...` | A4 印刷ビュー（PDF 化はブラウザ標準機能） |

## 帳票印刷 / PDF

ブラウザの印刷機能（A4・余白 14mm・「PDF として保存」）を利用。Lambda での Headless Chromium 依存を避けています。

- 納品書: `/print/orders/[id]`
- ピッキングリスト: `/print/orders/[id]/picking`
- 見積書: `/print/quotations/[id]`
- 発注書: `/print/purchase-orders/[id]`
- 請求書: `/print/invoices/[id]`

## CSV 取り込み / 外部サービス連携

`/settings/import` より、Excel や他受注サービスからの CSV を取り込めます。

### 対応ターゲット

| 対象 | 説明 | キー |
|---|---|---|
| 商品マスタ | 代金・在庫・仕入先コードを一括登録・更新 | `code` |
| 得意先 | 顧客コード・住所・TEL/FAX/担当者を一括 | `code` |
| 仕入先 | 仕入先コード・住所・連絡先 | `code` |
| 受注 | 複数明細を `受注番号` でグループ化して1 受注として作成 | `orderNumber` (重複はスキップ) |

### プリセット（同梱）

- 汎用（商品 / 得意先 / 仕入先 / 受注）— 列名を自動推測
- **Logigate eShip 受注**（ロジザード eShip、Shift_JIS）
- **インフォマート 受注**（BtoB プラットフォーム、Shift_JIS）

> プリセットの列名は代表値です。実際の CSV と一部違う場合は、プレビュー画面でマッピングを上書きして取り込みしてください。

### 機能

- 文字コード自動判定（UTF-8 / Shift_JIS / CP932 + BOM 除去）
- 区切り選択（カンマ / タブ / セミコロン）
- ヘッダ行・スキップ行指定、型変換（`¥1,500` / `2026/01/02` / `○×` など）
- ドライラン（DB 書込みなし検証） → エラーを修正→本取込
- 同コードの重複時の振る舞いを選択（スキップ / 更新）
- 取り込み履歴を `/settings/import/history` で確認、エラー行を BOM 付 CSV でダウンロード（Excel 対応）

### 外部サービス連携について

| サービス | 連携方法 | 備考 |
|---|---|---|
| **Logigate / eShip** (ロジザード) | CSV 取り込み | 同梱プリセットあり。SFTP / ZERO API 連携は今後のオプション |
| **インフォマート BtoB プラットフォーム** | CSV 取り込み | 同梱プリセットあり。公式 API は未提供 |
| その他一般的な CSV / Excel 出力 | 汎用プリセット + マッピング画面 | どのサービスでも CSV 出力があれば取込可能 |

## レガシーアプリからの移行

`/settings/legacy-import` から旧 C# アプリの XML を 4 種アップロード可能：

| ファイル | 内容 |
|---|---|
| Customer XML | 得意先マスタ（DataSet1） |
| Supplier XML | 仕入先マスタ（DataSet14/16） |
| Item XML | 商品マスタ（DataSet3/4） |
| Order XML | 過去の受注履歴（DataSet6/12/15） |

同コードレコードはスキップされ、参照整合は自動解決します。

## マルチテナント設計

- セッション JWT に `tenantId` を埋め込み、`requireTenant()` ヘルパーで全 Server Action / 画面読み取りに強制適用
- 全書き込みは `tenantId` を含む `where` でガード（`updateMany`/`deleteMany` の `count` を検査）
- 各マスタは `(tenantId, code)` 複合ユニーク制約 → テナントごとに独立したコード体系
- 行単位 RLS（PostgreSQL Row Level Security）は将来的な追加候補

## 新規顧客のオンボーディング（招待トークン制）

Stordex は **有償サービス** のため、自由なセルフサインアップは無効化されています。  
公開 URL `/signup` にトークン無しでアクセスすると、お問い合わせ案内のみ表示されます。  
入金確認後、運用者（Nammoku Solutions）が以下のコマンドで招待トークンを発行し、URL を顧客にメール送付します。

```bash
# 例: 南紀運輸様、テナントID固定、メール固定、有効期限14日
npm run issue-token -- \
  --company "南紀運輸" \
  --slug "nanki" \
  --email "owner@nanki.example.com" \
  --plan "standard" \
  --days 14
```

出力された URL（`https://app.example.com/signup?token=xxxx`）を顧客に送付。  
顧客はその URL からのみ新規テナント登録できます。

仕組み:
- `SignupInvitation` テーブル（`prisma/schema.prisma`）でトークンを管理
- `/api/signup` がトークン検証 → 1 回限り使用、期限切れ拒否、`allowedTenantSlug`／`allowedEmail` の事前固定可

## 請求・入金・アカウント停止フロー

企業間契約によるご提供のため、月額費用は **銀行振込** で頂いています。
仕組みと未入金時のアカウント停止フローは [BILLING.md](BILLING.md) を参照。

要点:
- `Tenant.status` (`ACTIVE` / `SUSPENDED` / `TERMINATED`) でアカウント状態を管理
- `SUSPENDED` テナントのユーザーは全画面で `/suspended` にリダイレクトされる
- 遡及可能なアカウント停止/解除は CLI:
  - `npm run suspend-tenant -- --slug demo --reason "2026-04 請求未入金"`
  - `npm run reactivate-tenant -- --slug demo`

## ライセンス・著作権

Copyright © Nammoku Solutions. All rights reserved.  
本ソフトウェアは Nammoku Solutions が所有する有償サービスです。  
無断複製・再配布・リバースエンジニアリングを禁じます。
