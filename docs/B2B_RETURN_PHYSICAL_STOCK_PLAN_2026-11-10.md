# Issue #82 — 企業間返品の実物返送・検品・在庫イベント（Draft）

**作成日: 2026-11-10。Staging/Productionへの適用・公開は未承認。**

## 現在の基準

- 最新Stagingコミット: `380e0e49da3a301c391c8d5fa87e71e279fd7c4d`。既存Prisma migration 7件。
- Prisma `20261104153000_b2b_return_requests` は承認済みPR #139で適用完了。
- 買い手返品申請/売り手一部承認のサービス・UIはPR #140/#141でStaging統合済み。
- 2026-11-10 UAT: `P-20261110-0001` で3箱返品申請、2箱一部承認（`PARTIALLY_APPROVED`）を確認。申請・承認だけでは在庫が動かないことを検証済み。
- `STORDEX_B2B_RETURNS_ENABLED=false` に復旧。現行Stagingの一般UIからは返品操作不可。

## 今回のDraftの差分

1. **未適用DBマイグレーション1件** `20261105100000_b2b_return_stock_events`：
   - `B2BReturnStockEvent` に`DISPATCH` / `INSPECTION`、tenant/line/UUID/数量、良品・不良品・InventoryMovement ID、ハッシュ、操作ユーザーを追記。
   - トリガーで承認済み状態、買い手/売り手の操作側、管理者権限、元商品と在庫移動の整合、返品数上限、部分検品上限を検証。
   - イベントは追記専用。**参照済みInventoryMovementはUPDATE/DELETEを拒否**。再送同一イベントは一意キーと指紋で冪等性を保証。
2. **書き込み内部サービス**：`postBuyerReturnDispatch` と`postSellerReturnInspection`。実際に呼び出された場合のみ`Item.stock`と`InventoryMovement`を書き換える。**本DraftではいずれのServer Action・画面からも未接続**。
   - buyer PO → TradingConnection → 返品申請 → 返品明細 → Item CASの一貫したトランザクションロック順。
   - Serializable transactionとP2034/40001の境界で限定リトライ。リトライ時も数量・権限・在庫を再検証。
   - 買い手は承認数量以下のOUTBOUNDのみ、売り手は実返送数以下を検品し、良品のみINBOUND。不良品のみは移動履歴を増やさずイベントに記録。
3. **使い捨てPostgreSQLに限定した統合テスト**：異なる企業の操作、STAFF拒否、二重送信、合計数量超過、部分返送、良品・不良品、同時実行、イベント/在庫履歴改ざん拒否。

## 禁止事項と未実装

- **Staging/Production DBにマイグレーションを適用しない**。CIの`APP_ENV=ci`使い捨てPostgreSQLのみ。
- 本PRはDraftのまま。ユーザーの個別承認、最新バックアップ、独立復元の比較・保持方針確認が揃うまで絶対にmergeしない。
- StagingへのUIやServer Actionsは作成せず、`STORDEX_B2B_RETURNS_ENABLED`をONにしない。
- 各テーブルのログから集計できる物理数量と、`B2BReturnRequest.status`の監査付き物理ステータス遷移は別ドラフトPR #129由来として別ゲート。返送/検品をDBに記録しただけで`CREDIT_PENDING`や`CLOSED`に移行させない。
- クレジットノート・返金・請求額修正、保管場所/ロット、不良品の隔離在庫・仕訳・通知は対象外。
- Productionリリースは全機能UATとCodex Astra全コードレビューPASS（Issue #87）が必須。

## 適用前レビュー項目

- マイグレーションの原文・追加トリガー・旧7件からの差分を確認。
- バックアップ/独立復元: Neon Stagingの24テーブル・7移行に対して新しい暗号化バックアップを取得し、別プロジェクトで行数/ハッシュとschemaを照合。
- マイグレーション名だけを明示したオーナー個別承認。`prisma migrate deploy`の無差別実行は禁止。
- 外部DBを使ったUATは本番Stagingではなく独立QA DBで先に行う。

## 最新Stagingの暗号化バックアップ操作（ユーザーのWSLのみ）

本Draftブランチ内の `scripts/backup-neon-staging-post-return-request.sh` は、
#139適用後のStaging 24テーブル・7 Prisma移行・NeonブランチID・マイグレーションchecksumを
一致確認する**読み取り専用**バックアップ専用ヘルパー。
古い `backup-neon-staging-post-provenance.sh` は22テーブル・6移行を想定しており、現在のDBには使わない。

```bash
cd ~/app/stordex # 実際のStordexリポジトリの場所へ移動
git fetch origin
git worktree add ../stordex-return-stock-qa origin/feat/b2b-return-physical-stock-ledger-draft-20261110
cd ../stordex-return-stock-qa
bash scripts/backup-neon-staging-post-return-request.sh --check
# --check がPASSした後、別途保管する暗号化バックアップを作成
bash scripts/backup-neon-staging-post-return-request.sh --execute
```

スクリプトはNeonのunpooledホスト、DBユーザー、DBパスワードを対話的に入力する。
パスワードやGPGパスフレーズをチャット・Git・ログに貼らない。
`--execute`は`pg_dump -Fc`をGPG AES256へ直接ストリーム暗号化し、
Gitリポジトリ外のprivateディレクトリへ保存する。既存DBの書き換えはしない。

**重要:** バックアップ生成・復号TOC/sha256照合PASSだけでは復元テスト完了とみなさない。
別の空のNeon DBに復元し、24表の行数と内容ハッシュ、全DDL/制約/トリガー、
Prisma移行の7件全checksumを独立照合すること。
復元先の削除や空のDBの新設は管理者の明示承認を要する。
