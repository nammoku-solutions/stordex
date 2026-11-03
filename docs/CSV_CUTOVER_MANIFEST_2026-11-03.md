# Issue #62 — 在庫移行時点の検証記録（Cutover Manifest）

更新：2026-11-03／対象環境：Staging（https://staging.stordex.jp）

## 何が追加されたか

管理者が「CSV 取り込み」→「在庫と履歴を照合する」で **商品・現在庫CSV** と **入出庫履歴CSV** の検証にPASSすると、「検証記録（JSON）をダウンロード」できます。

JSONには、フォーマットのバージョン、検証実施日時、元CSV 2件のSHA-256、テナント由来のフィンガープリント、同じファイルを再検証した際に一致する記録ID、商品別の移行時点の在庫と履歴状況が含まれます。

- `RECONCILED_LEDGER`：記録された最初の入出庫から開始残高を**推定**でき、履歴末尾とCSV現在庫が一致。
- `CUTOVER_ONLY_NO_HISTORY`：**移行時点の残高のみ**確認。過去の開始在庫は不明であり、架空の移動を生成しない。
- `generatedAt` は「検証記録を作成した日時」です。業務上のカットオーバー日時ではありません。
- `cutover.status = NOT_CONFIRMED`、`atomicSnapshotVerified = false`、`businessWritesPausedVerified = false` を固定。手動承認が完了したかのように表現しない。
- 記録IDは、フォーマット・対象ソーステナント・2ファイルのSHA-256から決定されます。別のテナント・別バイト列なら別ID。
- `verifyInventoryCutoverManifest` は、**元ファイルの実際のバイト列と全スナップショット情報が一致**する場合だけtrueを返します。書き換えられたJSONやCSVを誤って採用しないための補助チェックです。

## セキュリティと限界

1. 検証とJSON出力はOWNER/ADMINのみ。APIは`Cache-Control: private, no-store`で、DB書き込みを行わない。
2. JSONには商品コードと在庫が含まれるため、社外へ共有せず、元CSVとともに厳重に保管すること。
3. SHA-256と記録IDは**改ざん防止の署名ではありません**。悪意のある人物がJSONとCSVを揃えて改変する可能性は排除できない。
4. 元CSV 2種類は独立したエクスポートAPIで取得されるため、**同一時点の原子的なDBスナップショットは保証できません**。本番移行に先立ち在庫更新停止・カットオーバー時刻の記録・DBバックアップと独立復元検証が必要です。
5. 記録をダウンロードしても**StagingやProductionに仕入発注・在庫の復元は行いません**。CI専用の復元関数を実環境へ解放してはいけません。
6. 「移行した過去伝票の再入荷を禁止する」「移行履歴と業務履歴の区別」には、追加の不変な出自情報とServer Action側のガード、実DBテストが必要です。今回のJSONだけでは解決しません。

## 今回のUAT

1. https://staging.stordex.jp にdemoテナントのOWNER/ADMINでログイン。
2. 商品・現在庫CSVと入出庫履歴CSVをダウンロード。
3. CSV取り込みから「在庫と履歴を照合する」で両ファイルを選択しPASSを確認。
4. 「検証記録（JSON）をダウンロード」をクリック。
5. JSONに`format=stordex-inventory-cutover-v1`、`cutover.status=NOT_CONFIRMED`、商品数・在庫合計・履歴なし商品数が表示と一致することを確認。
6. この操作後に商品現在庫や入出庫履歴が変化していないことを確認。

## 次の開発ステップ

- 過去伝票と入出庫履歴に移行元・移行バッチを永続化し、業務上の更新禁止をServer Action/APIに実装する設計（Prisma新規migration候補）。
- 使い捨てPostgreSQLでの完全往復復元、冪等性と競合・テナント分離の検証。
- **Staging DBへの新規migrationは別途**、最新バックアップ→隔離復元→接続先・差分・CI照合→オーナーによる明示的な適用承認を必須とする。
- Productionは全機能完成後のCodex Astra Review PASSまで変更しない。
