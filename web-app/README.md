# Stordex Web App

物流・卸売業向け、受発注・在庫管理クラウド SaaS。レガシーの Windows Forms C# アプリ（`../original-app`）を、マルチテナント対応の Web アプリケーションとして再構築したものです。

## 技術スタック

- **Next.js 14** (App Router) + **TypeScript**
- **PostgreSQL** + **Prisma**
- **NextAuth.js** (Credentials, JWT セッション)
- **Tailwind CSS**
- **Zod** (入力バリデーション)

## ドメインモデル

すべてのテナントスコープテーブルに `tenantId` を付与し、リクエストごとにセッションのテナントで必ずスコープします。

- `Tenant` / `User` (ロール: OWNER / ADMIN / STAFF)
- `BusinessUnit` 事業所（複数事業所での請求発行に対応）
- `Customer` 得意先 / `Supplier` 仕入先
- `Item` 商品マスタ（在庫数、発注点、仕入/販売単価）
- `Quotation` / `QuotationItem` 見積書
- `Order` / `OrderItem` 受注（DRAFT → CONFIRMED → SHIPPED → COMPLETED / CANCELLED）
- `PurchaseOrder` / `PurchaseOrderItem` 仕入先発注（DRAFT → ORDERED → RECEIVED）
- `Invoice` / `InvoiceOrder` 請求書（月次集計、複数受注を 1 請求書に集約）
- `InventoryMovement` 在庫移動履歴（INBOUND / OUTBOUND / ADJUSTMENT）

ワークフロー連携：
- 受注を確定/出荷/完了に進めると自動で OUTBOUND を記録、在庫を引き落とし
- 仕入先発注を「入荷確定」に進めると INBOUND を記録、在庫を加算
- 請求書作成時は対象顧客・対象月の確定済み受注を自動集約（伝票ごと税 or 月次合算税の切替可）

## セットアップ

### 1. 依存をインストール

```bash
cd web-app
npm install
```

### 2. PostgreSQL を用意

ローカルで動かす例 (Docker):

```bash
docker run --name stordex-pg \
  -e POSTGRES_USER=stordex \
  -e POSTGRES_PASSWORD=stordex \
  -e POSTGRES_DB=stordex \
  -p 5432:5432 -d postgres:16
```

### 3. 環境変数

```bash
cp .env.example .env
```

`NEXTAUTH_SECRET` の生成（以下のいずれか）:

```bash
# Mac / Linux
openssl rand -base64 32

# Node があれば（クロスプラットフォーム）
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

出力された文字列を `.env` の `NEXTAUTH_SECRET="..."` に貼り付けます。

### 4. データベースを初期化

```bash
npm run db:push       # スキーマを反映
npm run db:seed       # デモテナント + サンプルデータ
```

シードが投入する初期アカウント：

| 項目        | 値                  |
| ----------- | ------------------- |
| テナントID  | `demo`              |
| メール      | `admin@example.com` |
| パスワード  | `password`          |

### 5. 開発サーバー

```bash
npm run dev
# → http://localhost:3000
```

## 主要画面

| パス                            | 内容                                                  |
| ------------------------------- | ----------------------------------------------------- |
| `/`                             | ランディング                                          |
| `/login` / `/signup`            | ログイン / 新規テナント登録                           |
| `/dashboard`                    | サマリー、最近の注文、在庫アラート                    |
| `/orders`                       | 受注一覧（本日受注 / 本日納品 / 翌日納品クイック絞り込み） |
| `/orders/[id]`                  | 受注詳細・状態遷移、納品書/ピッキングリスト印刷       |
| `/quotations`                   | 見積書 CRUD・印刷                                     |
| `/purchase-orders`              | 仕入先発注 CRUD・発注書印刷・入荷確定で在庫自動加算   |
| `/invoices`                     | 月次請求書（複数受注の集約・印刷）                    |
| `/customers` / `/suppliers` / `/items` | マスタ CRUD                                    |
| `/inventory`                    | 入出庫記録、在庫アラート、移動履歴                    |
| `/reports/products`             | 商品別月次レポート（受注数 / 売上 / 粗利）            |
| `/settings/business-units`      | 事業所設定（請求書発行元）                            |
| `/settings/legacy-import`       | 旧 C# アプリの XML（Customer/Supplier/Item/Order）取り込み |
| `/print/...`                    | 各種帳票の印刷ビュー（ブラウザの「PDF として保存」を利用） |

## 帳票印刷 / PDF

ブラウザの印刷機能（A4・余白 14mm・「PDF として保存」）を使う方式です。
Lambda での重い Headless Chromium 依存を避け、ユーザー側でいつでも PDF 化できます。

- `納品書`: `/print/orders/[id]`
- `ピッキングリスト`: `/print/orders/[id]/picking`
- `見積書`: `/print/quotations/[id]`
- `発注書`: `/print/purchase-orders/[id]`
- `請求書`: `/print/invoices/[id]`

## レガシーアプリからの移行

`/settings/legacy-import` から以下の XML をアップロードできます:

| ファイル              | 内容             |
| --------------------- | ---------------- |
| `Customer_data.xml`   | 得意先マスタ     |
| `Supplier_data.xml`   | 仕入先マスタ     |
| `Item_data.xml`       | 商品マスタ       |
| `Order_data.xml`      | 過去の受注履歴   |

同じコードのレコードはスキップされ、参照整合（受注 → 商品/得意先）も自動で解決します。

## マルチテナント設計

- セッション（JWT）に `tenantId` を埋め込み、`requireTenant()` ヘルパーで全 Server Action / 画面読み取りに強制適用。
- すべての書き込みは `tenantId` を含めた `where` でガードし、他テナントのレコードを更新/削除できないようにしています（`updateMany`/`deleteMany` で `count` を確認）。
- 各マスタは `(tenantId, code)` の複合ユニーク制約により、テナントごとに独立したコード体系を持ちます。

## レガシーアプリからの主な変更点

| 旧 (`original-app`)                                | 新 (`web-app`)                                |
| -------------------------------------------------- | --------------------------------------------- |
| Windows Forms (C# .NET)                            | Next.js (React Server Components)             |
| ローカル XML データセット (DataSet1〜17.xsd)       | PostgreSQL + Prisma 正規化スキーマ            |
| 単一マシン運用、Mutex で多重起動防止                | クラウド前提のマルチユーザー / マルチテナント |
| Back_Up / Up_Date / Starter / ErrorHandling 別 EXE | 1 つの Web アプリに統合（バックアップは DB 側で `pg_dump` を想定） |
| 操作ごとの個別フォーム (Form1〜Form9)              | サイドバー付きの統一 UI                       |

## 今後の拡張ポイント

- 監査ログ（誰が何を更新したか）
- 注文 PDF 出力 / メール送信
- CSV インポート（旧アプリの XML データ移行用）
- ロール別権限（STAFF はマスタ削除不可など）
- 自動発注（在庫アラート時に発注書ドラフトを生成）
- AWS 上での本番構成（ECS Fargate + RDS + ALB + Cognito など）

## デプロイ（AWS サーバーレス）

低コスト構成を `sst.config.ts` と [AWS_DEPLOY.md](./AWS_DEPLOY.md) にまとめました。

- **Next.js → Lambda（OpenNext）+ CloudFront + S3**
- **DB は Neon Serverless PostgreSQL（無料枠）または Aurora Serverless v2**
- 月額目安：MVP 規模で **¥1,000 以下〜**（Neon 無料枠採用時）

```bash
npx sst secret set DatabaseUrl    "postgres://..." --stage prod
npx sst secret set NextAuthSecret "$(openssl rand -base64 32)" --stage prod
npx sst secret set NextAuthUrl    "https://your-domain" --stage prod
npx sst deploy --stage prod
```

詳細は [AWS_DEPLOY.md](./AWS_DEPLOY.md) を参照。
