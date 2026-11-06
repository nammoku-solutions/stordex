# Issue #62 — 移行元データの分離保管／出自管理（設計・隔離DB検証）

更新：2026-11-03

> **状態：DB migrationを含む開発PR。Staging・ProductionのDBへ未適用。**
> Staging URL `https://staging.stordex.jp` では、現在は読み取り専用のCutover Manifestを出力可能。アーカイブへの実書き込みUI/APIは存在しません。

## 背景

既存の`PurchaseOrder`と`InventoryMovement`は、日常業務の発注・入荷・出庫・在庫計上に使います。過去伝票を直接登録すると、通常の入荷確定が実行され、**二重在庫計上**や過去データの意図しない変更につながる可能性があります。

このため、過去データは通常テーブルではなく、**独立した移行アーカイブ専用テーブル**に保存します。日常業務と完全に分離し、移行した履歴を編集・削除できないようDBで制限します。

## 提案する4テーブル

| テーブル | 目的 | 通常の業務機能との関係 |
| --- | --- | --- |
| `MigrationArchiveBatch` | 元CSVのSHA-256、source tenantの匿名フィンガープリント、Cutover Manifest IDと状態 | 通常の受発注とは無関係 |
| `MigrationArchiveItem` | 商品ごとの移行時残高、履歴の有無、推定開始残高 | `Item.stock`へ書き込まない |
| `MigrationArchivePurchaseOrder` | 元の発注番号とJSONスナップショットを保存する専用領域 | `PurchaseOrder`へ連結しない |
| `MigrationArchiveMovement` | 元の入出庫IDとJSONスナップショットを保存する専用領域 | `InventoryMovement`へ連結しない |

**Archive Batchの作成は、実際の移行可否の承認ではありません。** 初期状態は`PREPARED`、明示的な照合・確定後に`SEALED`へ一方向に進める契約です。作成日時も在庫確定時刻とは異なります。

## セキュリティ不変条件

- 移行先の全レコードに`tenantId`を持たせる。子レコードは`batchId + tenantId`の**複合外部キー**で同じテナントのBatchへの所属を強制。
- 子スナップショットはPostgreSQLトリガーにより`UPDATE`/`DELETE`を拒否。Prisma ORM経由の操作も拒否。
- Batchのsource tenant・manifestId・各ファイルhash・作成日時・tenantIdはDBトリガーで変更を拒否。状態は`PREPARED -> SEALED`だけを日時付きで許可し、`SEALED`から戻さない。
- アーカイブに通常の発注状態更新・入荷確定・在庫更新APIが参照できる業務テーブルとのリレーションを作らない。
- `archiveCutoverInDisposableCi()`はローカルCIの特定PostgreSQL接続だけに書ける。実行前に**元CSVのバイト列とJSON Cutover Manifestを完全照合**。
- 同一テナント・同一Manifest IDは一意。完全一致なら再実行は作成0件、内容が異なれば拒否。
- テナント・商品コード・移行元ID等の信頼境界をレビューし、アーカイブのDBレコードを業務上の現在庫として扱わない。

## 今回のCI統合テスト

使い捨てPostgreSQL16で新規migrationを適用し、Prisma schema diff、型チェック、単体テスト、ビルドを実行する。

- 2商品（在庫15・9）のCutover Manifestを隔離DBのアーカイブに登録
- 履歴あり商品は推定開始残高10、履歴なし商品は`CUTOVER_ONLY_NO_HISTORY`で歴史的開始残高`NULL`
- 再登録では同一Batchを返し、行が増えない
- CSVやManifestの改変、別ソーステナントを拒否
- 異なるテナントのBatchへの紐付けをDB複合FKで拒否
- アーカイブの商品行の変更・削除をDBトリガーで拒否
- Batch自体の所属テナントの変更をDBトリガーで拒否
- 既存`Item.stock`、`PurchaseOrder`、`InventoryMovement`には**一切書き込まない**
- `APP_ENV=staging`を渡すとDB接続前に拒否

## Staging DB適用前の必須手順

1. **PRのコード・SQL・トリガー・復元/削除時のデータ保持方針をレビューする。** アーカイブ不変性と法的なデータ削除義務が衝突しないよう要件確定が必要。
2. 現在のNeon Staging `dry-feather-14704968 / br-sparkling-boat-ao9nrctp / neondb`を読み取り専用で確認。履歴5件、既存データ保全を把握する。
3. **最新のStagingバックアップ**を取得し、別Neon clone／使い捨てDBへの復元を実証する。2026-11-02の旧バックアップを現在のUATデータの復元根拠として再利用しない。
4. 新SQLのスキーマ・データ・トリガーとCIをcloneで実地検証する。
5. 書込み停止条件・接続先・バックアップID・移行後照合方法を明記し、**オーナーの新しい明示承認**を受けてから一回だけStagingへ適用。
6. 対応コードのみStagingへデプロイし、ログイン・既存在庫・発注・受注のスモークテストを実施。
7. Productionへは一切適用しない。全機能完成とCodex Astra Review PASS後、独立した本番手順で対応。

## 今後の追加実装

- `MigrationArchivePurchaseOrder`と`MigrationArchiveMovement`に検証済み元CSVのスナップショットを保存するCI処理。
- 多ファイルを同一時点で凍結したことを確認するカットオーバー承認フロー、監査証跡。
- 読み取り専用のアーカイブ閲覧画面（通常の発注・受注操作ボタンを表示しない）。
- 長期保管と法令上の削除要求、テナント解約時の運用・保持期間・復元管理。DBの永続的な削除禁止に例外を設ける場合は別途高権限メンテナンス手順で設計する。

**本PR単独では完全CSV復元は完成しません。Issue #62は未完了のまま維持します。**
