# Stordex v1 — Codex Astra 最終レビュー引継ぎ

更新: 2026-11-25。**review request / status = READY_TO_REQUEST, NOT PASS**。GitHub Issue [#87](https://github.com/nammoku-solutions/stordex/issues/87) を唯一の本番レビューゲートとする。レビューが完了したふりをしないこと。

## 対象

- リポジトリ: `nammoku-solutions/stordex`、`staging` の**レビュー開始時の実際のHEAD SHAを固定**する。請求書同時作成修正のコード基準commitは `5cbc1920621abeb62f4453d022351972cd4967e8`（PR #192）。本書のマージ後にdocs-onlyのSHAが増えるため、レビュー担当は最終HEADを取得・記録する。
- 全コード: `src/**`（画面、Server Actions、API、認証・認可、マルチテナント、CSV、請求、受発注、在庫、B2B、返品/creditのフラグOFFコード含む）、`prisma/**`、`scripts/**`、`infra/**`、`sst.config.ts`、`.github/workflows/**`、依存関係、`next.config.mjs` と環境/運用ドキュメント。古いDraft PRをまとめてマージしてはいけない。
- 対象機能は [v1スコープ](STORDEX_V1_RELEASE_SCOPE.md) に固定。保留: 請求原本PDF審査、正式CreditNote/返金・相殺、過去履歴の完全復元、通知、FAX/OCR、高度集計。**OFFフラグだからコードのセキュリティレビューを省略する、という意味ではない**。

## 事前検証（Astraレビューと混同しない）

- 導線UAT PASS、買い手/売り手業務一貫UAT PASS、CSV・請求書表示 PASS。明細: [UAT記録](STORDEX_V1_UAT_RUNBOOK.md)。手元ファイルの添付未取得であることを明記。
- Neon Staging `dry-feather-14704968` / `br-sparkling-boat-ao9nrctp` / `neondb` は32テーブル/12完了migration/未完了0。Migration #12は既適用でGitにも同一SQL登録（PR #187）。**実DBの再適用・Restoreをレビューのために実行しない**。
- 請求書同時作成リスクを事前確認：`InvoiceOrder` DB索引は`(invoiceId,orderId)`複合PK、`orderId`非unique索引だけ。PR #192のトランザクション/テナントロックと、一時Postgresでの並行テストがPASS。**アプリの他の書込経路、真の一意制約、特殊な競合/デッドロック、rollback挙動を再レビュー**。
- StagingはVercel+Neon、ProductionはSST/OpenNext＋AWS Aurora PostgreSQL16（東京`ap-northeast-1`）。AWS OIDC Role/Trust・Auroraの制御付きmigration・復元/PITRは未承認の本番準備。production workflowは手動`workflow_dispatch`だけ。
- 既存CIの一時DB Migration12の「NOT APPROVED」などは古い**提案用artifactの文言**。現実のStagingへ適用済みのMigration12との混同を避けるため、Astraはリリース証跡の誤表示を指摘すること。

## Astraに渡すレビュー指示

**このリポジトリの最終Staging HEAD全体をレビューしてください。** 新機能の提案ではなく、v1スコープに対する本番公開ブロッカーを探す。次の分類を網羅する。

1. 機能の回帰と境界状態：受注・発注の状態遷移、出荷、実数入荷・パック、最低在庫・都度仕入、CSV、請求、返品のOFF境界。
2. 認証・認可・Tenant隔離：画面だけでなくServer Actions、API、DBアクセス、CSVの他社データ、公開されない機能の直リンク。
3. 在庫・会計の一貫性：二重処理、再送、競合、負在庫、数量差異、単価/税、月次集計、請求同時生成、CreditNoteが元請求と在庫に影響しないこと。
4. DB/移行：migration1-12の順序・checksums/DDL、Prisma drift、PostgreSQLロック、SQLのtenant制約、初期Production Aurora migrationと復元。
5. セキュリティ・保守：secret、dependency、CSV formula injection、XSS、入力制約、RCE/file upload、ログ/エラー露出、運用事故、可観測性。
6. 性能/効率/設計：不要なDBクエリやN+1、範囲の大きいimport/export、接続プール、ロック待ち/デッドロック、冗長なコードや安全なリファクタリング。
7. CI/CD・AWS：本番手動ゲートがバイパスされないこと、OIDCトラストの前提、東京固定、Aurora/PITR、DNS切替/ロールバック、Staging URLと本番の明確な分離。

## レビュー出力・判定

| Field | 必須 |
| --- | --- |
| 結果 | `PASS` / `BLOCKED`（CI結果とは別） |
| 重大度 | Critical / High / Medium / Low |
| 証拠 | ファイル・行、再現条件、想定被害、他コンポーネントへの影響 |
| 修正 | 具体的な変更・テスト・移行の有無、再レビュー |
| 対象バージョン | レビューしたgit SHA、依存バージョン・DB migration上限 |
| 残リスク | リリース対象外機能/運用・人間の判断が必要な点 |

Critical/Highが1件でも未解決、コード範囲未査読、実Production依存の前提未検証なら本番リリース`BLOCKED`。修正後にCI＋必要なStaging UATを再実施し、変更後のコード全体（または重複なく全範囲）を再レビューして**明示的なAstra PASS**を記録する。最終のproduction deployはユーザーの別途承認が必要。 
