# Issue #82 — 独立レビューメモの監査保存サービス（Draft）
2026-11-06

この機能は未承認のDB移行が必要なDraft PR #128の`B2BCreditReviewAudit`を利用する。Staging/Productionでは有効化しない。

## 実装した処理

`recordIndependentCreditReviewEvidence`：
1. レビュー担当者の所属テナント・ACTIVE状態・OWNER/ADMINロールをDBで確認。入力フォームの任意権限フラグは信用しない。
2. 全B2B更新サービスと同じ買い手PurchaseOrder → TradingConnection → 返品申請 → 返品明細 → CreditNoteの順にロックし、Serializableで処理。
3. 監査対象CreditNoteが同じ売り手企業のDRAFTであり、レビュー担当者が作成者本人ではないことを確認。
4. 元Invoiceが同企業のISSUED/PAIDで、売り手受注を含み、CreditNoteの元伝票スナップショットが現在のInvoiceと整合し、元の企業間取引が有効であることを検証。
5. 実際の物理`INSPECTION`イベント数量と、他のCreditNote下書きも含めた割当数量を集計し、検品数を超えないことを確認。
6. `NEEDS_REVISION`では、税額未記載や別途確認が必要な旨をレビューコメントに記録。`CHECKS_RECORDED`では少なくとも提案明細/合計/税額/元請求書の算術整合を確認する。ただし**国別税法・適用税率・入金/返金履歴の合法性を承認したわけではない**。
7. レビュー時点のCreditNote、元Invoice、実検品・割当数量をソート順を揃えてSHA-256で記録。履歴はAppend-onlyで改ざん不可。
8. `(sellerTenantId, eventId)`の一意制約により、同じイベントID・同じレビュー担当者/アクション/コメントの再送は既存記録を返し、別内容の再利用は拒否。
9. CreditNoteのDRAFT状態や元Invoiceの税/総額を変更せず、銀行・カード・請求の送金/相殺処理を実行しない。公開Server Actionにも接続しない。

## 隔離DBの統合テスト

元請求書・売り手/買い手・返品・検品・CreditNote下書きを構築して、NEEDS_REVISION保存、再送の無副作用、アクション/コメント差分での拒否、作成者・STAFF・他社拒否、未記入金額をCHECKS_RECORDEDとして扱えないこと、暫定金額を記入した後の機械的整合記録、元InvoiceとCreditNoteの非確定状態維持を検証する。

## 承認待ち

この記録は正式なクレジットノートの承認ではない。将来は入力元のユーザー認証をServer Actionで導入し、国・通貨・税率/端数規則、元入金・過去調整・支払い残高を独立の会計システム/台帳で確認したうえで、別の発行・精算サービスとDB移行の承認を行う必要がある。

Issue #109のNeon不要ブランチ削除はユーザーが実施予定。削除後に新しいStagingコピー、独立した外部バックアップ/復元試験、保持・削除ポリシー、移行ごとの承認が必要。Productionは全機能完了・UAT・Codex Astraの全コードレビューPASSまで変更しない。
