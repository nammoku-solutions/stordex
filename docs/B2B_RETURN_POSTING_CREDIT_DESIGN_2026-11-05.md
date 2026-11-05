# Issue #82 — 返品返送・検品イベントとCreditNote安全設計
作成: 2026-11-05

## 現状
本PRは**副作用のない計算・検証だけ**。在庫・請求を変更しない。
Stagingへ展開できるのはこの純粋関数とテストに限る。実際の返品・返送
・検品処理はDraft #107 → #112 → #115 → #117の未承認の依存チェーン上にある。

## 在庫の物理移動は必ず別々の段階で記録

| 業務イベント | 買い手在庫 | 売り手在庫 | 記録 |
|---|---:|---:|---|
| 返品申請 | 変更なし | 変更なし | 申請と承認待ち数量 |
| 売り手承認・一部承認 | 変更なし | 変更なし | 承認決定 |
| 買い手返送確定 | **現物返送分だけOUTBOUND** | 変更なし | 返送イベント・返送中残数 |
| 売り手現品検品 | 変更なし | **良品だけINBOUND** | 検品イベント、良品数、不良品数 |
| クレジットノート確定 | 変更なし | 変更なし | 元請求に紐づく金額調整台帳 |
| 返金・入金相殺 | 変更なし | 変更なし | 決済・債権債務の別台帳 |

同一イベントの再送では、ユニークな `(tenantId, phase, eventId)` のイベントを
確保し、**同じpayloadHashなら既存結果のみ返し、違うpayloadなら拒否**。
同一イベントIDを変更して数量を増減させることは禁止。
ただし別のイベントIDでの再送もあり得るので、返送合計は承認残数を超えないよう
全履歴をロック中に再集計する。

既存 `InventoryMovement` に返品専用の一意参照キーがないため、
将来のDraft DBモデルには、返送/検品イベントからInventoryMovement IDへ
**一意かつ不変のリンク**を持たせ、同じ台帳移動を二重記録できないようにする。
不良品だけの検品イベントは検品履歴を保存するが、0数量の入庫を作らない。

売り手側の商品IDは正確な `IntercompanyOrderItem.sellerOrderItemId`
→ `OrderItem.itemId` を使う。過去のNULLを商品コード/数量から推測しない。
買い手側は元PurchaseOrderItemのitemIdを使う。失効した企業間接続、
状態変更済み元受発注、権限不足、競合更新での引当失敗は拒否。

## 実装時のロック・トランザクション・失敗時処理

1. 本人確認と所属企業・ロール確認、元取引と戻し先のアイテム所在確認。
2. **一貫した順序**で元買い手PurchaseOrder、TradingConnection、
   ReturnRequest、該当Item行をロック。複数ItemはID昇順。
3. 返品行単位で返送済合計・検品済合計・承認済数量を読み直し、現在庫と
   PostgreSQL int4範囲を再検証する。
4. イベントUUIDと元データのhashをDBの一意制約でclaimする。
5. `Item.stock` を条件付きCASで更新し、`InventoryMovement`と
   返送/検品イベントを**一つのSerializableトランザクション**で保存。
   COMMITに失敗したら全部ROLLBACK。
6. 部分返送・部分検品・全部不良品・配送中紛失・外部在庫システムとの
   差異・二重クリック・ネットワーク切断後再試行・同時操作を独立PGでテスト。
7. 在庫不変条件・総額整合・過去履歴の改変防止を検証するまでUI有効化なし。

返送履歴と検品履歴を区別するため、検品完了とCreditNoteの金額確定は別状態。
返送中数量を入庫済と見なさない。

## CreditNote設計

現在の `InvoiceOrder` は、1請求書に複数受注を紐づけられる。
`Invoice.taxPerOrder` で税計算方法も変わり、状態はDRAFT/ISSUED/
PAID/CANCELLED。さらに入金・返金の実績と過去のクレジット残高を考慮する。

したがって **返品明細の数量 × 元単価 = 確定返金額** としてはならない。
本PRの前提チェックは、良品/不良品を含む検品済数と元請求書の有無・状態・
税計算方式を確認し、金額を自動確定せず `MANUAL_RECONCILIATION_REQUIRED`
などのステータスを返す。

将来の保存モデル案：
- `CreditNote`: tenant、originalInvoice、originalOrder、returnRequest、
  creditNoteNumber、通貨、状態（DRAFT→ISSUED→APPLIED/VOID）、元税率、
  元の請求確定snapshot、税計算方針、金額、作成・承認監査。
- `CreditNoteLine`: return line、承認・検品の数量配分、金額、税額、
  元Invoice/OrderItemの参照（複合FKで企業境界を強制）。
- `CreditApplication`: 債権との相殺・実際の返金指示/支払イベント、
  外部決済IDと重複防止キー。これらはCreditNoteとは別イベントとして追跡。
- 元請求書の `subtotal/tax/total` や既存 `InvoiceOrder` を上書きしない。
- 二重CreditNote、部分金額調整と端数処理、税込/税抜、複数税率、
  請求書全体課税、PAID請求からの返金、VOID・取消を検証する。

## 保留事項
- 新規DBスキーマ・実際の返送/検品/金額調整サーバー操作・配信メールは
  このPRには**含まれない**。
- 独立して復元できるバックアップ、Neonブランチ容量（Issue #109）、
  履歴保持/削除ポリシー、個別migration承認が必要。
- Productionは全機能完成とUAT後のCodex Astra全体レビューPASSまで保留。
