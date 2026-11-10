# Issue #82 — B2B返品申請・売り手審査UI（未公開）

## 2026-11-10 最新Stagingへの統合

- 売り手明細のprovenanceはPR #133、返品DBテーブルは承認済みPR #139、内部申請・売り手審査サービスはPR #140でStaging適用済み。
- 本UIは旧Draft #136から最新Stagingへ差分移植。既存の売り手注文詳細「返品の事前確認（閲覧のみ）」を保持。
- `STORDEX_B2B_RETURNS_ENABLED`は未設定またはfalseのまま。各返品ルートは404、Server Actionsは書込拒否。**本PRで有効化しない**。
- 新たなDBマイグレーションはなく、在庫・返品現物・検品・請求・CreditNoteへの書込み機能もない。Productionへの変更なし。

## 買い手・売り手画面

- 買い手のPO詳細: 企業間取引に紐づく場合のみ返品申請・履歴のリンク（機能フラグON時）。
- `/returns/new?purchaseOrderId=...`: 出荷済seller Order、入荷済buyer PO、正確なsourceLine ID対応を確認したうえでフォームを表示。表示された入荷数量は返品可能残数とは限らない。
- `/returns`: ログインテナントが買い手/売り手となる返品申請のみ一覧表示。
- `/returns/[id]`: 自社の申請のみ閲覧。売り手OWNER/ADMINかつ未審査時のみ承認・一部承認・拒否入力。
- 売り手のOrder詳細: 既存読み取り専用の返品準備表示を維持して申請一覧リンクを追加（機能フラグON時）。

## 認可・整合性

- Server Actionsはサーバーの認証セッションからtenantId/userIdを取得し、hidden FormDataによるIDや権限の自己申告は使用しない。
- サービス層でACTIVEの企業接続、実出荷・実入荷、個別商品明細対応、申請可能累計量、管理者権限をSerializableトランザクション中に再検証。
- UUID idempotencyで二重送信を防ぎ、レビューはCASで二重確定を防止。一部承認・拒否にはコメントを必須とする。
- 不明なDB/内部エラーは利用者に一般的な失敗メッセージとして返す。
- 申請・承認では一切在庫数・在庫移動・請求・返金を変更しない。

## リリース前ゲート

- PR CI のMigration/Schema Drift、型チェック、Vitest、ビルド、依存関係監査PASSが必要。
- 機能ONは別途の明示承認後。買い手・売り手両テナントのUAT計画、機能OFF確認、権限・失効接続・数量競合・部分承認・二重クリック・クロステナント検証が先。
- Productionは全機能完了後のCodex Astra全体レビューPASSとオーナー承認を条件とする。
