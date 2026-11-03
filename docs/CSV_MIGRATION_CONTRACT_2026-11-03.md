# CSV移行／復元データ契約（第1段階：仕入発注の読取り専用事前検証）

更新：2026-11-03／Issue [#62](https://github.com/nammoku-solutions/stordex/issues/62)

**実装範囲：CSV構造・明細・集計整合性の事前検証だけ。書き込み・復元・在庫反映は未実装。** この段階では、既存Staging/Production DBを更新しない。

## 1. 現在の入出力の非対称性

| データ | CSV出力 | CSV取込／復元 |
| --- | --- | --- |
| 得意先 | 可能 | 可能（ただし履歴メタデータをすべて再現するわけではない） |
| 仕入先 | 可能 | 可能 |
| 商品＋現在庫＋在庫ポリシー | 可能 | 可能。必要に応じて在庫差分のADJUSTMENTを作成 |
| 受注・受注明細 | 可能 | DRAFTとしての取込が可能。元の状態・入出庫履歴の再現ではない |
| 仕入発注・発注明細・入荷済数量 | 可能 | **今回：構造・整合性の事前検証のみ**。復元未実装 |
| 入出庫履歴／倉庫・ロット情報 | 可能 | 未実装 |

**「CSV出力できる」ことは「そのCSVから完全に復元できる」ことを意味しません。** 全件移行は隔離DB内での検証・照合結果が揃うまで行わない。

## 2. 仕入発注のCSV形式と検証ルール

出力元：`/settings/export` → 「発注と過去履歴」。インポート画面の「仕入発注CSVを検証する」→ `/settings/import/purchase-orders` を開く。

出力列（順不同。ただしすべて必須）：

```text
poNumber,supplierCode,supplierName,orderDate,pickupDate,status,note,taxRate,subtotal,tax,total,itemCode,itemName,unit,quantity,unitPrice,amount,received,packSize,packCount,packUnit,createdAt,updatedAt
```

- ファイルはStordexが出力したUTF-8 BOM付きCSV。2MB以下、最大10,000明細行。1件の発注の複数明細は同じ`poNumber`を繰り返す。
- 同一伝票の`poNumber, supplierCode, supplierName, orderDate, pickupDate, status, note, taxRate, subtotal, tax, total, createdAt, updatedAt`は各行で一致する必要がある。
- 数量は1以上の安全な整数、単価・金額・税は0以上の安全な整数。明細`amount = quantity × unitPrice`。小計は明細の合計、`tax = floor(subtotal × taxRate / 100)`、`total = subtotal + tax`。
- `status`は `DRAFT/ORDERED/RECEIVED/CANCELLED`。日付は`YYYY-MM-DD`、タイムスタンプはUTC ISO形式。欠損日付・不正値は拒否。
- 旧入数データの`packSize/packCount/packUnit`は3つとも空欄可。パック仕入の伝票は3つが揃い、`packSize >= 2`、`packCount >= 1`、`quantity = packSize × packCount`。
- 入荷実績の`received`は非負整数。過納品はあり得るため、`received > quantity`は拒否せず警告する。状態が`RECEIVED`以外で入荷済数量が正の場合も警告する。
- 不正な明細を含む伝票を部分的に復元しない。検証エラーが1件でもあれば、復元候補の全データを返さない。
- **検証PASSが保証するのは構造・明細計算・伝票内整合性のみ**。商品・仕入先の存在、テナント間関係、過去の入出庫、請求・支払、外部参照先、移行先の一致は保証しない。

実装：`src/lib/csv/purchase-order-preflight.ts`（Prisma依存なし・read-only）、`src/app/api/import/purchase-orders/preflight/route.ts`（OWNER/ADMIN限定・DB書込なし）。APIレスポンスには元のCSV行・商品名・仕入先名の全文を含めない。

## 3. 復元時に守るべき不変条件（今後の開発ゲート）

1. **テナント所有権**：ログイン中テナントからすべての相手先・商品をコード解決する。CSVのテナントIDや他社レコードIDを信頼しない。
2. **冪等性**：同一テナント・ソース識別子・外部伝票番号・明細の再取込で二重作成しない。履歴削除や既存伝票への無条件上書きは禁止。
3. **履歴不変性**：旧伝票の`status`／`received`を入れても、現在の業務フローを呼んで自動`RECEIVED`へ遷移させない。移行済の在庫を再加算しない。
4. **在庫整合**：商品現在庫の初期基準点と過去`InventoryMovement`を同時に再計上すると二重加算になる。migration baseline／履歴モードを設計し、差分・残高を検算する。史実を再現できない履歴は警告して分離する。
5. **取引スナップショット**：金額、税率、箱数・入数、明細名、入荷実績、伝票日付は元データのスナップショットとして保存し、商品マスタの現行値で再計算しない。
6. **境界**：最大行数・ファイルサイズ・トランザクション件数・エラーレポート件数を制限。内部エラー・パスワード・CSVの個人情報をログに出さない。
7. **復元検証**：初回は隔離したDisposable PostgreSQL/Neon cloneのみで操作し、件数・参照・金額・在庫残・履歴の粒度を突合。実Stagingへの書込み前には最新のバックアップ/復元リハーサル・オーナー承認が必要。

## 4. 安全な利用・テスト順序

1. 管理者で検証用Previewへログイン（実Staging Aliasは変更しない）。
2. 「CSV エクスポート」から発注CSVをダウンロードする。
3. 「CSV 取り込み」から「仕入発注CSVを検証する」を開く。
4. ダウンロードしたCSVを選択し「CSVを検証する（書き込みなし）」をクリックする。
5. 伝票数・明細数・入荷済数量・エラー・警告を照合する。検証後のDBレコード件数、在庫合計が変わらないことを確認する。
6. 改変CSV（小計不一致、未完成パック情報、不正日付）ではFAILを確認する。
7. 次のPRで **仕入発注復元** の永続化仕様（追加migrationと隔離DBテスト含む）を設計・実装。その後に **在庫履歴／基準残高** を扱う。

この機能は出荷・返品・受発注状態を更新しないため、過去のUAT結果やNeon Stagingの5件のmigrationを変更しない。
