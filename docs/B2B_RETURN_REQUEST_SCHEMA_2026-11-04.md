# Issue #82 — 返品申請・承認データモデル（Draft / 機能未公開）

**2026-11-06更新：この返品申請マイグレーションは使い捨てCI・QA検証専用。Staging・Production DBには未適用。**

依存順序：Staging に seller-line provenance #133（`20261104150000_b2b_seller_line_provenance`）が適用済み → 本Draft PR（返品申請・明細テーブル）。元PR #107の再適用は禁止。
CSVアーカイブのDraft PR #97/#100/#104も別途あり、正式な移行順序の調整が必要。

## 業務上の位置付け

出荷前の受注取消（Issue #81）と、出荷後の現品返品・金額調整（Issue #82）は別の業務操作。

- `B2BReturnRequest` は企業間取引に紐づく買い手からの申請として、買い手と売り手のテナントID、申請者、申請番号、状態・監査時刻を保持。
- `B2BReturnItem` は、元の `IntercompanyOrderItem` 明細ごとの数量・理由・売り手承認数量を保持。上限は申請数量、下限は0。
- `requestedQuantity`、元の取引/明細ID、理由などの申請時の根拠は変更不可。売り手の判断は別フィールドに記録。
- 元受注、仕入発注、出荷履歴、在庫、既存請求書のステータスは自動変更しない。
- `ReturnShipment`、`ReturnReceipt`、`CreditNote` は別Migrationの候補。まだ定義・実装・デプロイしていない。

## DB境界

1. `ReturnRequest` の `buyerTenantId` と `sellerTenantId` は、DBトリガーで紐づく `IntercompanyOrder` と一致を強制する。
2. `ReturnItem` の `returnRequestId + intercompanyOrderId` と `sourceLineId + intercompanyOrderId` はそれぞれ複合FKで保護。異なる企業間取引の明細を差し込めない。
3. `requestedQuantity > 0`、`0 <= approvedQuantity <= requestedQuantity` をDBチェック制約で保護。
4. `(buyerTenantId, requestNumber)` と `(returnRequestId, sourceLineId)` の一意性で、番号衝突・同一申請の重複明細を拒否する。
5. 元伝票の所属を隠したり変更したりできないよう、親申請の識別子・申請者と子申請明細の根拠を不変にする。

## 追加の実装が必要

- 申請Action：認証済みの買い手 OWNER/ADMIN 権限、ACTIVEなパートナー、確定した出荷・入荷、正確な売り手OrderItem ID、返品上限と過去の申請/返品の累積量を**取引ロック中**に再検査する。
- 承認Action：売り手 OWNER/ADMIN 権限、承認数量と状態遷移、同時更新のCAS、変更履歴・否認理由。
- 一部承認・申請取下げ・複数申請/同時申請・接続取消・請求済みの場合の処理。
- 買い手返送時の在庫OUTBOUNDは、現品確認と一意な返送イベント後に**1回だけ**実行する。
- 売り手受領・検品では、良品と不良品を分離して良品のみを入庫する。輸送中紛失、在庫差異、検品差異を追跡する。
- 税率・請求・入金・返金の調整は後続のCreditNote設計で取り扱い、元請求を改ざんしない。
- データ削除・保管ポリシー、操作ログ、CSV出力、Google Drive利用者マニュアル、UAT。

## 2026-11-06 検証・復元準備状況

- `staging` のseller-line provenance移行はPR #133で適用済み、`_prisma_migrations` 記録6件。
- 変更前のWSL `pg_dump` はGit管理外、GPG AES-256の復号/ハッシュ照合PASS（オーナー報告）。独立した別Neonプロジェクトへの復元後、22テーブルのデータ指紋・DBスキーマ完全一致を確認。
- **この既存バックアップは#133適用前の状態**。本移行をStagingで行う際には、適用後状態の新しい暗号化バックアップも取得し、元の復元可能性を確認する。
- 本PRは最新Stagingからの検証用ブランチであり、ユーザーの明示承認なしにマージやライブDB操作をしない。

## デプロイ停止条件

- Neon Stagingは子ブランチのためsnapshot API/PITRが使えない。旧検証ブランチ4件はオーナーが削除済み。複製枠を確保し独立別Neonプロジェクトへの復元も検証済み。ただし最新の適用後バックアップは別途必要。
- 古いNeonブランチを承認なしに削除・リセットしない。独立した復元可能な最新バックアップの検証、保持/削除方針、マイグレーション順序と個別承認が揃うまでStaging DBは変更しない。
- 使い捨てPostgreSQLでのPrisma migration/schema-drift/型・統合テスト・ビルドがPASSしても、それは本番データへの適用承認ではない。
- Productionへは全機能実装・UAT・Codex Astra 全体最終Review PASS前に適用しない。

## 2026-11-10 Staging移行の個別承認・リリース計画

- オーナーが、移行名 `20261104153000_b2b_return_requests` のStaging適用を明示承認。
- #133適用**後**のStaging 22テーブル・6移行に対して、別Neonプロジェクト `delicate-rice-23940930` の新DB `stordex_restore_post_provenance_20261110` へ暗号化バックアップから復元済み。22/22テーブルの行数・全行ハッシュ一致、457/457件のスキーマ/制約/インデックス/ENUM等の一致、6件のPrisma履歴チェックサム一致。
- PR #134の隔離PostgreSQL CI PASS、および現在のStagingデータを複製したQAブランチで**この移行の21 SQL文**を適用し既存22テーブルのデータが不変、新規2テーブルが空、外部キー・トリガーが有効であることを確認。
- このPRは**同じmigration.sqlをバイト単位で保持**したまま、現行Stagingを基点に切り出したリリースPR。既に適用済みの `20261104150000_b2b_seller_line_provenance` は再適用しない。
- リリースはこの移行**1件だけ**をトランザクション内で適用・Prisma履歴登録し、既存データの再照合をPASSしてからStagingにPrisma schemaとテストをマージ。新しい返品申請/明細テーブルにはUI/Server Actionをつながない。
- 後続の申請・審査サービス #135、画面 #136、出庫・検品・クレジットノートのDraftは独立であり、**今回の承認に含まれない**。機能フラグ`STORDEX_B2B_RETURNS_ENABLED`はOFFのまま。Productionは変更せず、最終Codex Astraレビューを必須とする。
