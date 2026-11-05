# Issue #82 — クレジットノート独立レビューの監査履歴（Draft）

**2026-11-05：隔離PostgreSQLでのみ検証。Staging/Production DBには未適用。**

## 目的
返品の検品数量を元に作成したクレジットノート下書きが、同じ担当者の自己承認や改ざんされた履歴によって正式発行・返金に進まないよう、**独立したレビューの証跡**を保存する。

## 実装内容
新規 `B2BCreditReviewAudit`：
- `sellerTenantId`、`creditNoteId`、`reviewerUserId`、`eventId`、`sourceSnapshotHash`、`action`、`reviewNote`、`createdAt`
- 同一企業内のイベントUUIDにUNIQUE制約。改ざん・削除はDB Triggerで禁止
- 作成者と異なる、同一売り手企業のACTIVEなOWNER/ADMINだけがレビュー記録を作成可。他企業・STAFF・作成者本人は拒否
- レビュー対象のCreditNoteは `DRAFT` 状態に限り、行ロックで審査中の変更競合を抑える
- `CHECKS_RECORDED`（照合記録）/ `NEEDS_REVISION`（再検討）の2つのみ。**APPROVED/ISSUEDではない**
- ハッシュはDB上で形式を検証するが、**元請求書・税額・全明細・入金/過去調整実績との一致を証明するものではない**。今後の認証済みサービスが改ざん不可能なスナップショットを再取得して比較する必要がある

## 審査手順（今後の公開処理）
1. 元請求書が発行済み/入金済みであり、同じ売り手企業の元受注を含むことをDBから再照合
2. 返品明細・実物検品数と他下書きの割当数、税額配賦・端数・通貨単位・元入金をロック下で照合
3. レビュー担当が作成者と別の売り手管理者であることを認証状態から確認
4. レビュー時点のCreditNoteヘッダー・明細・Invoice・説明・根拠をハッシュ化し、監査履歴をAppend-onlyで確定
5. **正式発行は別の承認済みサービスと別マイグレーション**で行う。現在の `B2BCreditNote_draft_only_check` は絶対に解除しない
6. 返金・請求相殺・外部送金は、別の精算台帳と承認・二重実行防止が完成するまで実装しない

## 検証
CIの使い捨てPostgreSQLで、独立レビュー成功・同一イベントID再登録拒否・本人/STAFF/他社拒否・不正Hash拒否・監査証跡のUPDATE/DELETE拒否・元CreditNoteのDRAFT維持を確認する。

## 安全条件
未承認の前提マイグレーション #107/#112/#119/#121 が必要。Issue #109の独立復元可能バックアップとオーナー承認の完了までDraft維持。メール配信/実返金/税額確定/金融台帳の更新なし。全機能完成後、Production前のCodex Astra全コードレビューPASS必須。
