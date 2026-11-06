# Issue #82 — 返送・検品後のステータス更新（Draft）
作成: 2026-11-06 / 安全ゲート: Issue #109

## 実装
- `B2BReturnStatusEvent`：どの企業のどの管理者が、どの返品申請を、どの状態からどの状態へ変更したかを追跡するAppend-only台帳。
- `(tenantId,eventId)`にUNIQUE制約。UUID/数量根拠Hash・リクエストHashを保存し、同じイベント再送は結果を返し、同じIDで異なる変更は拒否する。
- DBレベルでは、物理作業の遷移のみを許可。買い手APPROVED/PARTIALLY_APPROVED→DISPATCHED、売り手DISPATCHED→PARTIALLY_INSPECTED/INSPECTED→CREDIT_PENDING。CLOSEDや承認状態の飛び越しは禁止。
- 台帳SQL Triggerは現在の返品ステータスが遷移先と一致すること、操作企業が買い手/売り手として適切なこと、担当者がその企業のACTIVE OWNER/ADMINであること、記録のUPDATE/DELETEを拒否することを確認。
- `recordPhysicalReturnStatus`：買い手PO→TradingConnection→ReturnRequest→ReturnItemを決めた順にロックし、最新の物理返送/検品イベントとCreditNote下書き割当、元受発注の状態をDBから再取得。純粋関数`assessB2BReturnStatusTransition`で数量・権限・遷移を検証し、B2BReturnRequestの状態を条件付きCASで更新、監査イベントを同一Serializableトランザクションに記録。どちらか一方が失敗した場合、両方ROLLBACK。
- 同一イベント再送時は現在の数量や次の状態が変わっていても既存結果を返す（ただし本人/企業の認証はその都度実施）。
- 精算台帳が未実装の現段階ではCLOSEDを更新するAPIは追加しない。正式CreditNote発行や金銭移動も実装しない。

## 統合テスト
CI限定の使い捨てPostgreSQLで以下を確認：
- 買い手の実返送あり→DISPATCHED
- 同一イベントの再送では追加書込なし、異なる再送内容・他企業の操作は拒否
- 売り手の一部検品→PARTIALLY_INSPECTED、全部検品→INSPECTED、会計レビュー待ち→CREDIT_PENDING
- STAFF権限での変更拒否
- 監査履歴を変更/削除できないこと
- 独立した同時2操作が同じAPPROVED状態を変更しようとしたとき成功は1件のみ

## 未完了と安全制約
このDraftは、未マージのB2B返品DB/物理在庫イベント/クレジットノートの依存チェーンを前提とするため、実運用のStagingにマージ・公開しない。登録画面・Server Actionから呼ばれていない。

ステータス更新のために使った入力`userId`, `tenantId`は、将来のServer Actionではセッション認証状態からのみ設定し、ブラウザ入力を使用しない。ステータスイベントの入力Hashは将来の不変な発行/精算履歴を代替しない。関連するレビュー・返金・税計算は別台帳の独立検証が必要。

Neonのブランチ削除はユーザーが管理画面から実施する予定。上限10/10のため、ユーザーによる不要検証ブランチ整理→最新Stagingの新しいコピー/外部バックアップの作成→独立復元試験→migration単位の承認が先。Productionには触れない。全機能完成後にCodex Astraの全コードセキュリティ/性能/回帰レビューPASSが必須。
