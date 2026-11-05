# Issue #82 | CreditNote独立審査と返品ステータス遷移の事前検証
2026-11-05

## このPRに含まれるもの
- `assessB2BCreditApprovalPreflight` — 元Invoiceの発行/支払状態、元企業とレビュー企業、元伝票の一致、税込/税抜金額・税額・全明細の合計、他の調整案の残高、実際に検品した返品品の残数を照合する**純粋関数**。
- クレジットノート作成者とレビュー担当を分離する。レビュー担当は同じ売り手企業のOWNER/ADMINであること。本人による自己承認を禁止。
- 税額配賦根拠、審査コメント、元請求書税方式、端数ルール、通貨の最小単位、既存CreditNoteと入金履歴の照合を明示的なレビュー項目とする。
- この結果は常に `CHECKS_PASSED_NOT_APPROVED`。DBの状態変更、税・請求書の更新、CreditNote発行、相殺、銀行送金は一切実行しない。
- `assessB2BReturnStatusTransition` — 不可逆な返品状態更新を行う将来のサービスに先立つ遷移可否チェック。勝手な飛び越し/巻戻し/二重更新、未返送の検品完了、調整残高の未照合による完了を拒否する。

## 返品の状態遷移
- SUBMITTED → UNDER_REVIEW / REJECTED / WITHDRAWN
- UNDER_REVIEW → APPROVED / PARTIALLY_APPROVED / REJECTED / WITHDRAWN
- APPROVED / PARTIALLY_APPROVED → DISPATCHED （実物の返送を確認）
- DISPATCHED → PARTIALLY_INSPECTED （一部検品）または INSPECTED （全量検品）
- PARTIALLY_INSPECTED → INSPECTED （承認済み数量に対して返送・検品完了）
- INSPECTED → CREDIT_PENDING
- CREDIT_PENDING → CLOSED （**返金/相殺の精算台帳が照合済み**または**調整不要が独立監査済み**であり、完了理由を記録した場合だけ）

売り手/買い手管理者の役割もそれぞれの操作で確認する。
ただし現段階では承認や在庫イベントをDBに書き込むコードは接続しない。

## 注意事項
- `creditApproval`の真偽値やoperator IDをブラウザから受け取って信用してはならない。将来の書込サービスはログイン主体・所属企業・InvoiceOrder・返品元・税・支払台帳・元のCreditNote全量を再取得し、同じトランザクション内で再検証する。
- ステータス更新も買い手PurchaseOrder → TradingConnection → ReturnRequest/Item → InventoryMovement/CreditNoteの順にロックし、同じイベントIDの再送に対して結果を再利用する設計が別途必要。
- 現在のDraft #121のDB CHECKはCreditNoteの**DRAFT以外の保存を禁止**。その制約を解除するのは税法・精算監査・双方向UATとオーナー承認が整った時のみ。
- ネットワーク送信、実会計更新、メール通知、Staging/ProductionのDBマイグレーションは行わない。
- DB移行を伴う別PR群はIssue #109の独立復元・保持ポリシー・マイグレーション別承認を待つ。最終Productionは全機能実装後のCodex Astra全体レビューPASSが必須。
