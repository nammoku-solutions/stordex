# Stordex — 機能実装棚卸し・Production前残課題（2026-11-03）

> 対象：`nammoku-solutions/stordex`、PR #89 の検証済みコード `0a052891b8998bf6023eacc32a34a33ac683949c`。
> 作業状態：Staging（`https://staging.stordex.jp`）で既存実装の全UATをオーナーがPASSと報告し、切り替え後スモークもPASS。Productionは未変更、Codex Astra Reviewは未実施。
> この文書は**現状棚卸しと実装順序**であり、新規未実装機能のUAT合格・完成認定ではない。

## 1. 実装済み・Staging UAT確認済みの基盤

| 領域 | コード根拠・内容 | 判定 |
| --- | --- | --- |
| マルチテナント・認証 | `src/lib/session.ts`、`src/lib/tenant-resources.ts`、`src/lib/auth.ts` | 実装済み。全権限の網羅的RBAC監査は別途必要 |
| 得意先・仕入先・商品・事業所 | `src/app/(app)/{customers,suppliers,items,settings/business-units}` | 実装済み。商品IDの非同期ルーティング修正済み |
| 受注・見積・発注・請求・帳票 | `orders`、`quotations`、`purchase-orders`、`invoices`、`print` | 実装済み。現在の業務フローについてオーナーUAT PASS |
| B2B企業間取引 | `src/app/(app)/network`、`orders/inbox`、`src/lib/b2b-*` | 双方の接続・発注送信・受注作成・出荷・入荷・出荷前取消まで実装・UAT済み |
| 在庫履歴 | `src/app/(app)/inventory/history`、`src/lib/inventory-history.ts` | 指定日・期間の逆算照会を実装。過去の初期残高に信頼性制限あり |
| 在庫区分・パック仕入・差異入荷 | Issue #88、PR #89、`INVENTORY_WORKFLOW.md`、Prisma migration 5件目 | Staging DB適用、既存データ保全、CI、UAT PASS |
| CSV出力 | `src/app/api/export/[target]/route.ts` | 得意先・仕入先・商品・受注・発注・入出庫の6種を出力可能 |
| CSV取込 | `src/app/api/import/route.ts`、`src/lib/csv/import.ts` | 得意先・仕入先・商品・受注の4種に対応。ドライラン、文字コード、行数・ファイルサイズ制限、重複処理あり |
| CI・Staging | `.github/workflows`、Staging Vercel Preview、Neon | 対象コミットのCI＋PostgreSQL統合PASS、Staging切替後スモークPASS |

重要：**「現行UAT全PASS」≠「追加要件の実装完了」**。本番判断はさらに全機能範囲確定・以下の残課題・最終レビューが必要。

## 2. 未完了・追加整備が必要な領域

### P0 — CSVを用いた完全移行・復元（Issue #62）
- 6種のエクスポートに対し、インポートは4種。**発注（ヘッダ＋明細＋入荷履歴）および在庫移動履歴**を同じアプリへ再構成する仕組みは現状未実装。
- CSV出力→**隔離した別テナント/使い捨てDB**へのインポートで、件数・各行・在庫残・金額・税率・商品ポリシー・単位・伝票間参照の同一性を検証するエンドツーエンドの完全なラウンドトリップ試験は未完了。
- インポートの単一テナント内/外部データ重複、バッチ中断、部分成功、過去日付、在庫初期基準の扱いを業務ルールとして決め、サーバー側ガードと実Postgres統合テストで固定する。
- 先に**読取り専用のエクスポート仕様・移行データ契約**と隔離環境用テストケースを確立し、その後に発注／在庫履歴インポートを実装する。ライブStagingへの大量復元やリセットを行わない。

### P0/P1 — 出荷後の返品・検品・クレジットノート（Issue #82）
- 既存の出荷前取消は実装済みだが、`SHIPPED` / `COMPLETED` や `RECEIVED` 後の返品・部分返品・交換・請求調整は別のモデル/ワークフローが必要。
- 買い手の返品出庫、売り手の受入検品、再販売不可品の区別、原伝票と数量上限、返金・相殺、監査履歴、重複・競合防止を含める。
- 新規Prisma migrationと両テナントUATが必要。返品の実装を出荷前の`CANCELLED`に流用しない。
- **初回リリース必須範囲か後続リリースかは、Issue #82 の現行要件から自動推測しない**。本番レビューの前にオーナーとの範囲確定が必要。

### P1 — 在庫の割当・過不足・履歴信頼性（Issue #88 / 将来拡張）
- `ON_DEMAND` の「下書き需要」は参考値で、正式な予約・引当ではない。販売確定後の在庫減算を二重に数えない一方、複数下書きの競合には別の予約モデルが必要。
- 分納・一部入荷の継続処理、請求差異、B2Bの受入差異の合意・調整は現行スコープ外。Issue #82 の返品設計と整合させる。
- 過去在庫照会は現在庫と履歴から逆算しているため、既存の履歴欠損・移行前残高は監査可能な真実とみなさない。バッチ移行時の在庫基準点・有効日を整備する。

### P1 — 権限・セキュリティと製品品質
- `OWNER/ADMIN/STAFF` の詳細RBACは全画面・API・Server Actionまで網羅したことが確認できない。テナント分離と異なる権限チェックを独立して棚卸しする。
- 並行更新、金額・税計算、帳票参照ID、APIのファイル上限、監査ログ、監視・障害対応などをCodex Astra Reviewの対象に含める。
- 依存更新はPR #90（Issue #64関連）がPR #89側にマージ済み、CI PASS。ただしIssue #64はopen。依存監査をRelease時に再実行し、PR #91など重複変更は個別に精査する。

### 将来/検証計画 — FAX（Issue #63）
- FAX受注OCR・送信APIは現在**調査・パイロット対象**。OCRの結果を受注確定に直結させたり、承認なしでFAXを送信したりしない。
- 20件程度の匿名化サンプル、事業者・コスト・保存・個人情報要件と精度評価が先。Production範囲へ自動追加しない。

## 3. PR・Issueの整理に関する注意

- PR #89 は実装済みだが**open**で、baseは `chore/neon-staging-migration-preflight-20261019`。関連PRが多数openの**積み重ね構成**。main/developへまとめてマージしない。
- Issue #70 は本文が旧い（Stagingに履歴がない状態）ままだが、実際のNeon Stagingは2026-11-03確認時点で5件のPrisma履歴が正常完了。履歴基準と検証コメントを優先する。誤って `--baseline`/ `--inventory` を再実行しない。
- Issue #88 は新機能のStaging完成・UAT実施を証跡に更新し、残る引当/返品/分納の改善は別Issueで管理。無条件で本番完了としない。
- Issue #64 は依存修正PR #90がマージ済みだがIssueはopen。次のリリース準備で最新監査とIssue状態を整合させる。
- Issue #87 の**Codex Astra Review PASS**がProductionに対する絶対条件。CI PASS、Preview READY、Staging UAT PASSのみでは解除できない。

## 4. 推奨する実装順序（Productionを触らない）

1. **既存機能の固定化・要件スコープ確定**：この棚卸し、仕様とテストの不一致、オープンPRの依存関係、CSV/返品の初回リリース範囲を整理する。
2. **Issue #62：CSVラウンドトリップ**。まず隔離DBでのデータ契約・テストと取込可能範囲を増やす。差分PR、監査可能なデータ整合性チェックを追加。
3. **Issue #82：返品・クレジットノート**（初回リリース対象の場合）。原伝票/数量制限、Prisma migration、冪等性とB2B双方のUATまで実装する。
4. **Issue #88の残る在庫改善**（本番範囲に採用する場合）。予約・在庫引当、分納、B2B差異解消と上記返品を一貫した在庫台帳で接続する。
5. **RBAC、環境設定、旧手順書の修正、PR依存の整理、CI/セキュリティ監査**。Stagingで再テスト。変更後の新しいUATは別途実施。
6. **Issue #87：Codex Astra Review（全コード・全機能・マイグレーション・インフラ）**。重大指摘を修正し、再レビューでPASSを得る。
7. **別途オーナーの本番承認後のみ**、Issue #4/#5に沿ってTokyo `ap-northeast-1` のAWS OIDC、Aurora、backup/PITR、マイグレーション経路を構築・検証して本番デプロイする。

## 5. 直近のDone判定

- 新機能は、仕様・制約・テナントとロール権限・実PostgreSQLテスト・失敗/再試行・実際のStaging UI UAT・利用者向けドキュメントを揃えて初めて完了とする。
- CI/プレビューのPASSのみで残るIssueやAstraレビューをPASSにしない。
- Stagingへ新しいPrisma migrationを適用する際は、追加バックアップと隔離復元テスト、厳格な対象ブランチ確認、オーナーの明示承認が必須。
- Productionは全機能の実装・レビューPASS・本番承認まで変更禁止。

## 主要証拠

- [PR #89 — 在庫・仕入機能](https://github.com/nammoku-solutions/stordex/pull/89)
- [Issue #62 — CSV完全ラウンドトリップ](https://github.com/nammoku-solutions/stordex/issues/62)
- [Issue #82 — 出荷後返品・クレジットノート](https://github.com/nammoku-solutions/stordex/issues/82)
- [Issue #88 — 在庫ポリシー・パック・受入数量](https://github.com/nammoku-solutions/stordex/issues/88)
- [Issue #87 — 全体Codex Astra Review](https://github.com/nammoku-solutions/stordex/issues/87)
- [Issue #4/#5 — Production OIDC / Aurora](https://github.com/nammoku-solutions/stordex/issues/4)
