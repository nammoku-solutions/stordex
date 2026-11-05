# Issue #82 — 返品実物イベント台帳（2026-11-05 Draft）

**このブランチは未承認のDB migrationを含み、Staging・Productionに適用していません。**
依存: Draft #107 売り手明細ID → Draft #112 返品申請 → Draft #115 申請/審査Service → Draft #117 画面 → 本Draft。

## 新規テーブル `B2BReturnStockEvent`

- `returnItemId`: 返品申請明細へFK。元の企業間取引・買い手明細・売り手明細の対応IDをすべて追跡できる。
- `phase`: `DISPATCH`（買い手返送）または `INSPECTION`（売り手検品）。
- `tenantId, phase, eventId`: **UNIQUE** で同じイベントIDを二重記録しない。`payloadHash`で再送内容が同じか比較するため、Hashは変更不可。
- `movementId`: 原則1イベント1件の `InventoryMovement` にUNIQUE FK。買い手返送はOUTBOUND、売り手検品は良品数だけINBOUND、不良品のみならmovementを作らない。
- 数量のDB CHECK: 数量正、良品/不良品数合計=検品数、方向とmovementの有無が適切。
- SQLガード: 返品行を `FOR UPDATE` ロックした状態で申請済み承認数、返送済み総数、検品済み総数を集計。承認超え返送・返送超え検品を拒否。売り手/買い手企業の境界、元商品IDと在庫移動の商品ID、移動種別/数量、操作ユーザーの管理者権限を照合。
- 返品イベントを一度作成したらUPDATE/DELETEは禁止。元のInventoryMovementもFKで不用意に削除できない。

## 適用後も追加実装が必要

このmigrationと統合テストがPASSしても**実際の業務処理を行うサーバーサービスは未公開**。
今後のServiceは認証後、元買い手PO → 企業間接続 → 返品申請/行 → Item（ID順）の
一貫した順にロックし、最新状態・数量・在庫を再確認、アイテムの条件付き在庫更新、
InventoryMovementとイベント記録を一つのSerializableトランザクションで実行する。

二重クリック/リトライでは、DB上の一意キーを確認し、保存済みHashが一致すれば既存結果を返し、
不一致なら拒否する。違うイベントIDで同じ返送を再実行しても、承認数量の総和制約で拒否する。
同一イベントを再試行する場合、元商品在庫が後から変化していても**再減算・再加算しない**。

全不良の検品、部分返送/検品、紛失、取扱停止商品、同時在庫調整と出荷処理、
保管場所別在庫、請求書の税額/返金・支払いとの整合も別PRで検証する必要がある。

## CI / ロールバックゲート

- 使い捨てPostgreSQLでmigration・Prisma型・インサート制約・改ざん拒否・FK・ビルド検証。
- Issue #109でStagingバックアップの独立復元/検証を終え、対象migrationと保持/削除方針の**オーナー個別承認**を得るまでDraft維持。
- Staging/Production DBに書き込まない。メールも送らない。
- 最終Productionでは全機能のUATとCodex Astra全コードレビューPASSを必須とする。
