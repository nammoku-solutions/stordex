# テストケース集（Test Cases）

各ケースに ID を付け、実施結果は別途 Excel / GitHub Issues などに転記してください。

凡例: 重要度 H=High / M=Medium / L=Low

---

## 1. 単体テスト (UT) — `npm test`

| ID | 対象 | テスト内容 | 重要度 | 期待結果 |
|---|---|---|---|---|
| UT-01 | `computeTotals` | 空配列 | H | subtotal=tax=total=0 |
| UT-02 | `computeTotals` | 1 行 (3×100, 10%) | H | subtotal=300, tax=30, total=330 |
| UT-03 | `computeTotals` | 複数行合算 | H | 全行 amount を合計 |
| UT-04 | `computeTotals` | 端数切捨て (199円, 10%) | H | tax=19 (floor) |
| UT-05 | `computeTotals` | 税率 0 | M | tax=0 |
| UT-06 | `computeTotals` | 負数で例外 | H | throws |
| UT-07 | `nextSequentialNumber` | 既存なし | H | `XX-YYYYMMDD-0001` |
| UT-08 | `nextSequentialNumber` | 既存あり (0007) | H | `0008` |
| UT-09 | `nextSequentialNumber` | 異プレフィックス無視 | M | `0001` |
| UT-10 | `nextSequentialNumber` | ゼロ埋め 4 桁 | M | `0100` |
| UT-11 | `parseCsv` | クォート内のカンマ・改行 | H | 1 セルとして保持 |
| UT-12 | `parseCsv` | `""` エスケープ | H | ダブルクォートを 1 つの `"` に復元 |
| UT-13 | `parseCsv` | CRLF と末尾改行 | H | 空行除去 |
| UT-14 | `parseCsv` | タブ区切り | M | 指定区切りで分割 |
| UT-15 | `stringifyCsv` | クォート・エスケープ付き round-trip | H | parseCsv(stringifyCsv(x)) === x |
| UT-16 | `decodeCsvBuffer` | UTF-8 BOM 除去 | H | 本文のみ返る |
| UT-17 | `decodeCsvBuffer` | Shift_JIS 強制 | H | 「あ」 (0x82A0) を復元 |
| UT-18 | `autoMap` (ITEM) | 列名から alias マッチ | H | code/name/unit/salesPrice が一致 |
| UT-19 | `coerceValue` int | `¥1,500` → 1500 | H | ok=true |
| UT-20 | `coerceValue` int | `abc` はエラー | H | ok=false |
| UT-21 | `coerceValue` date | `2026/01/02` | H | UTC の Date オブジェクト |
| UT-22 | `coerceValue` bool | `○` / `×` | M | true / false |
| UT-23 | `coerceValue` string | 空文字列 | M | null |

実行: `npm test`（24 件すべて pass を確認）

### 追加推奨 UT（未実装・順次追加）
- `format.yen / num / dateJP` — null/undefined/0 の表示
- 月次請求書の集計関数（`taxPerOrder` の True/False で結果差）
- レガシー XML パーサ — フィールド別名解決

---

## 2. 結合テスト (IT) — DB + Prisma + Server Action

実 DB（ローカル PostgreSQL）に対して実行。各ケース前に `prisma.$executeRaw` でテナントを再作成。

| ID | 対象 | 手順 | 重要度 | 期待結果 |
|---|---|---|---|---|
| IT-01 | テナント分離 | テナント A の Customer 一覧取得時にテナント B のデータが混入しないこと | H | 件数=A のみ |
| IT-02 | 受注作成 → 在庫減算 | 在庫 10 の商品で qty=3 の受注を CONFIRMED 作成 | H | Item.stock=7、InventoryMovement(OUTBOUND, balance=7) が 1 件 |
| IT-03 | 受注 DRAFT → CONFIRMED | DRAFT で作成→ CONFIRMED に変更 | H | 在庫減算が **1 回だけ** 発生 |
| IT-04 | 受注 CANCELLED | CONFIRMED 受注を CANCELLED | H | 在庫が元に戻り、INBOUND 補正が 1 件 |
| IT-05 | 仕入先発注 RECEIVED | qty=5 の PO を RECEIVED に | H | Item.stock += 5、INBOUND 1 件、`received` 更新 |
| IT-06 | 月次請求書集約 | 顧客 X の対象月の確定済受注 3 件を Invoice 化 | H | Invoice.subtotal=3 件合計、orders 3 件リンク |
| IT-07 | 請求書二重請求防止 | 既に Invoice に含まれた Order を再度 Invoice 化しない | H | 2 回目は対象 0 件 |
| IT-08 | 税切替（taxPerOrder） | 同データで True/False を比較 | H | 端数差が出る場合に明示的差分 |
| IT-09 | code 重複ガード | 同テナント内で同じ Customer.code を作成 | H | unique 制約違反 |
| IT-10 | XML 取り込み | サンプル DataSet1 XML を投入 | H | Customer 件数が増え、stats.skipped=既存重複 |
| IT-11 | 在庫ロット記録 | OUTBOUND に lotNumber/expiryDate を入れて作成 | M | Movement に保存、検索可能 |
| IT-12 | CSV 商品取込 | 同テナントに 3 件の商品 CSV | H | createdCount=3 / Item が 3 件追加 |
| IT-13 | CSV ドライラン | mode=dryrun で取込 | H | DB 件数不変、ImportJob.status=DRYRUN_OK レコード作成 |
| IT-14 | CSV 重複コードスキップ | upsertMode=skip で同コードを再取込 | H | skippedCount=N / DB 変更なし |
| IT-15 | CSV 重複コード更新 | upsertMode=update で同コードを再取込 | H | updatedCount=N / レコードの名称等が更新 |
| IT-16 | CSV 受注グループ化 | 同一 orderNumber で 3 明細 | H | Order 1 件 + OrderItem 3 件 |
| IT-17 | CSV 受注重複伝票 | 既存 orderNumber を含む CSV | H | 重複分 skippedCount、新規のみ createdCount |
| IT-18 | CSV 未登録商品 | itemCode 未登録で受注取込 | H | 該当行が errors に追加、Order は作成されずスキップ |
| IT-19 | CSV テナント分離 | demo で取込 → acme のマスタ件数不変 | H | tenantId で完全分離 |
| IT-20 | CSV Shift_JIS 自動判定 | encoding=auto で SJIS バイト列 | H | 文字化けず読み込み成功 |

セットアップ:
```bash
createdb stordex_test
DATABASE_URL="postgresql://...stordex_test" npm run db:push
DATABASE_URL="postgresql://...stordex_test" npm test
```

---

## 3. 機能テスト (FT) — 画面シナリオ（手動 / Local 環境）

すべて `npm run dev` 起動後 http://localhost:3000 で実施。

### 3-1. 認証

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-A01 | 未ログインで `/orders` にアクセス | サインインへリダイレクト | H |
| FT-A02 | デモアカウントでログイン | `/dashboard` に遷移 | H |
| FT-A03 | 誤パスワードでログイン | エラーメッセージ表示 | H |
| FT-A04 | ログアウトボタン押下 | サインインに戻る | M |
| FT-A05 | 8 時間後にアクセス（または cookie 改ざん） | 再ログイン要求 | M |

### 3-2. マスタ管理

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-M01 | 顧客新規作成（必須項目のみ） | 一覧に追加 | H |
| FT-M02 | 顧客編集（住所・電話変更） | 反映 | M |
| FT-M03 | 商品作成: 規格・産地・ｹｰｽ入数・発注単位を入力 | 一覧で表示 | H |
| FT-M04 | 商品の最低在庫を設定し在庫を下回らせる | アラート/警告色 | M |
| FT-M05 | 仕入先と商品を紐付け | 発注画面で絞り込み可能 | H |
| FT-M06 | 事業所追加・既定切替 | 既定が 1 件のみ | M |
| FT-M07 | 倉庫追加 | 在庫移動画面で選択可能 | M |

### 3-3. 受注

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-O01 | 新規受注 → DRAFT で保存 | 在庫変動なし、一覧に DRAFT 表示 | H |
| FT-O02 | 同受注を CONFIRMED に | 在庫減少、出庫履歴 1 件 | H |
| FT-O03 | 単価×数量の自動計算 | 即時反映 | M |
| FT-O04 | 税率を 8%/10% で切替 | tax/total が再計算 | H |
| FT-O05 | 本日受注 / 本日納品 / 翌日納品 のクイックフィルタ | 該当行のみ | M |
| FT-O06 | 納品書印刷 | 別タブで A4 ビュー、印刷可 | H |
| FT-O07 | ピッキングリスト印刷 | 単価非表示・チェック欄あり | H |
| FT-O08 | CANCELLED に戻す | 在庫が復元 | H |

### 3-4. 見積書

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-Q01 | DRAFT 作成 | 一覧に表示 | H |
| FT-Q02 | DRAFT → SENT → ACCEPTED | バッジ色変化 | M |
| FT-Q03 | 印刷（御中・有効期限） | 表示確認 | H |
| FT-Q04 | REJECTED → 削除 | 一覧から消える | L |

### 3-5. 仕入先発注

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-P01 | 仕入先選択時に商品リストが絞り込まれる | 該当商品のみ表示 | H |
| FT-P02 | DRAFT → ORDERED → RECEIVED | RECEIVED で在庫加算 | H |
| FT-P03 | 部分入荷（received < quantity） | 残数が次回分として保持 | M |
| FT-P04 | 発注書印刷 | A4 表示、合計一致 | H |

### 3-6. 月次請求書

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-I01 | 顧客 + 対象月で対象受注が自動表示 | CONFIRMED/SHIPPED/COMPLETED のみ | H |
| FT-I02 | 既請求済の受注は除外 | 二重請求が起きない | H |
| FT-I03 | taxPerOrder=ON/OFF で合計差を確認 | 期待計算式で一致 | H |
| FT-I04 | 事業所を切り替え | 印刷の発行元が変わる | M |
| FT-I05 | DRAFT → ISSUED → PAID | バッジ更新 | M |
| FT-I06 | 請求書印刷 | 伝票一覧 + 商品別明細 | H |

### 3-7. 在庫管理

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-S01 | 手動で OUTBOUND 登録 | 在庫減少、履歴に balance 記録 | H |
| FT-S02 | ADJUSTMENT で実地棚卸 | 在庫が指定値、差分が履歴に | H |
| FT-S03 | ロット番号・賞味期限・棚番を記録 | 検索結果に反映 | M |
| FT-S04 | 倉庫別に在庫一覧 | 倉庫 ID で絞れる | M |
| FT-S05 | 発注点割れ警告 | 該当行に表示 | M |

### 3-8. レポート

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-R01 | 月次商品別売上を表示 | 数量・売上・粗利が一致 | H |
| FT-R02 | mode=qty/sales/margin 切替 | ソート列が変わる | M |
| FT-R03 | 該当月にデータなし | 空表示 + メッセージ | L |

### 3-9. 旧 XML 取り込み

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-X01 | 4 種 XML を全選択して送信 | stats に各種件数 | H |
| FT-X02 | 同じファイルを再送信 | skipped が増えるだけ | H |
| FT-X03 | 不正な XML を送信 | エラーメッセージ、DB 影響なし | H |

### 3-9b. CSV 取り込み（`/settings/import`）

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-C01 | 商品タブ → UTF-8 CSV アップロード → プレビュー | ヘッダ・先頭 10 行表示、列マッピングが自動充填 | H |
| FT-C02 | Shift_JIS の CSV を encoding=auto でアップロード | 文字化けずプレビューされる | H |
| FT-C03 | 必須項目（code や name）のマッピングを外してドライラン | 該当行が errors に表示、「必須項目が空」メッセージ | H |
| FT-C04 | ドライラン OK を確認 → 本番取込 | createdCount/updatedCount が加算、/items に表示される | H |
| FT-C05 | 商品 CSV を upsertMode=skip で再取込 | skippedCount=全件、データ不変 | H |
| FT-C06 | 同じ CSV を upsertMode=update で取込 | 名称や住所の修正が DB に反映、updatedCount が加算 | H |
| FT-C07 | タブ区切り CSV を delimiter=タブで取込 | 正しく列分割される | M |
| FT-C08 | 受注タブ → 同じ orderNumber の明細 3 行を含む CSV | 1 受注 + 3 明細で created=1、/orders で確認 | H |
| FT-C09 | 受注 CSV を同じものを再取込 | すべて skippedCount、重複伝票なし | H |
| FT-C10 | 受注 CSV で customerCode 未登録 + customerName あり | 得意先が自動作成され、受注も作成 | M |
| FT-C11 | 受注 CSV で itemCode 未登録 | 該当行 errors、その受注はスキップされる | H |
| FT-C12 | エラーあり取込 → 「エラー行を CSV でダウンローヒ | BOM 付 CSV がダウンロードされ、Excel で文字化けず開ける | H |
| FT-C13 | `/settings/import/history` | 取り込み履歴が新しい順に表示、ステータス色・エラー CSV リンクが表示 | H |
| FT-C14 | Logigate eShip プリセット選択 → アップロード | encoding=Shift_JIS / マッピングが自動セット | M |
| FT-C15 | インフォマート プリセット選択 → アップロード | encoding=Shift_JIS / マッピングが自動セット | M |
| FT-C16 | サイドバーに「CSV 取り込み」リンクあり | `/settings/import` へ遷移 | L |

### 3-10. テナント分離・データ混合の防止（最重要）

> 前提: `npm run db:seed` 投入済み。`demo` (デモ卸売株式会社) と `acme` (ACME物流株式会社) の 2 社が存在し、商品コード (`P001`/`P002`)・顧客コード (`C001`)・仕入先コード (`S001`)・受注番号 (`SO-20260101-0001`) が**意図的に重複**している。

| ID | 手順 | 期待結果 | 重要度 |
|---|---|---|---|
| FT-T01 | `demo`/`admin@example.com` でログイン → `/items` | `P001` = 段ボール（小） ¥60、在庫 500 のみ表示。acme の「パレット」は出ない | H |
| FT-T02 | ログアウト → `acme`/`owner@acme.example.com` でログイン → `/items` | 同じ `P001` が「パレット（木製）」¥2,800、在庫 200 で表示。`demo` の段ボールは出ない | H |
| FT-T03 | `acme` で `/customers` → `C001` 詳細 | 「西日本流通サービス」のみ。「鈴木商店」は表示されない | H |
| FT-T04 | `acme` で受注一覧 → `SO-20260101-0001` を開く | `acme` の「西日本流通サービス」宛 受注のみ表示 | H |
| FT-T05 | `demo` で受注詳細 URL（例 `/orders/<demo の UUID>`）をコピー → ログアウト → `acme` で同 URL を開く | 404 / アクセス拒否（テナントID で絞り込まれている） | H |
| FT-T06 | `acme` で在庫を OUTBOUND 100 → `demo` でログインし `P001` 在庫確認 | `demo` の在庫 500 が変化していないこと | H |
| FT-T07 | `acme` で受注新規作成 → `demo` の顧客「鈴木商店」が顧客選択ドロップダウンに**出ないこと** | acme 内顧客のみが選択肢 | H |
| FT-T08 | `demo` で月次請求書を作成 → 対象月の受注一覧 | `acme` の受注が一切混じらない | H |
| FT-T09 | `acme` で `/reports/products` 表示 | acme の商品(パレット等)のみ集計、`demo` の段ボールは出ない | H |
| FT-T10 | `acme` で印刷ビュー (`/print/invoices/[id]`) | フッター/発行元事業所が ACME 大阪支社、`demo` の本社情報は出ない | H |
| FT-T11 | DevTools の Network タブで `acme` 操作中に `tenantId` パラメータを `demo` の ID に書き換えて再送信 | 200 が返らない（Server Action 側で session.tenantId と照合） | H |
| FT-T12 | 旧データ XML を `acme` で取り込み → `demo` のマスタが増えていないこと | demo のマスタ件数が変わらない | H |
| FT-T13 | `acme` で CSV 取り込み → `demo` で取込したコードが見えないこと | demo のマスタ/受注一覧に acme のデータが出ない | H |
| FT-T14 | `acme` で ImportJob 作成 → `demo` の `/settings/import/history` | acme のジョブが一切表示されない | H |

---

## 4. 総合テスト (ST / UAT) — Staging 環境（クライアント立ち会い）

クライアントの **実業務 1 日分のシナリオ** を Staging で再現。

### ST-01 受注〜出荷〜請求の一気通貫
1. 朝、顧客 A から電話受注 → DRAFT で 5 件登録
2. 数量・単価・納期を確認 → CONFIRMED に
3. 倉庫担当: ピッキングリスト印刷 → 出庫
4. 出荷後: SHIPPED → 納品書印刷
5. 月末: 顧客 A 宛の月次請求書を作成 → 印刷 → ISSUED
6. 入金後: PAID

**期待結果**: 在庫推移、履歴、金額がすべて一致。

### ST-02 仕入〜入荷〜在庫
1. 朝の市場発注 → 仕入先 X に 3 商品の PO 発行
2. 発注書印刷
3. 引取後 → RECEIVED → 在庫が加算

### ST-03 月次請求の正確性（最重要）
1. 顧客 B に対し対象月の受注 10 件
2. 請求書を taxPerOrder=ON で生成
3. 同条件で OFF 版を別途生成
4. 想定と差額を確認

### ST-04 複数事業所
1. 事業所 1 から請求書 → 振込先表示が 1 用
2. 事業所 2 から請求書 → 振込先表示が 2 用

### ST-05 旧データ移行
1. 客先の旧アプリから書き出した実 XML を取込
2. 顧客件数・商品件数・受注件数が旧アプリ集計と一致

### ST-05b CSV 取り込み（他サービス連携）
1. クライアントが使用中のサービス (Logigate eShip / インフォマート / 自社 Excel) から CSV をエクスポート
2. `/settings/import` よりプリセット選択しアップロード
3. ドライラン → 必要に応じてマッピング修正 → 本取込
4. 顧客と一緒にエラー行を確認、必要に応じてテンプレートを調整
5. 受注件数・金額が元サービスと一致することを確認

### ST-06 性能（軽量負荷）
- 在庫 1,000 件、月間受注 500 件のデータで一覧・レポートが 2 秒以内
- ブラウザ DevTools の Performance で測定

### ST-07 認可・セキュリティ
- 別テナントの ID を URL で直接指定 → 404/403
- DevTools で他テナント ID にリクエスト → 同上
- ログアウト後の戻るボタン → 保護ページにアクセスできない

### ST-08 印刷帳票の業務適合
- A4 縦に収まる
- 御中・自社情報・税率表示・合計が業務上正しい
- ブラウザ「PDF 保存」でファイル化可能

---

## 5. 本番 Smoke テスト (Production)

デプロイ直後、本番データに影響しない範囲で実施。

| ID | 手順 | 期待結果 |
|---|---|---|
| SM-01 | https://app.example.com にアクセス | サインイン画面 200 OK |
| SM-02 | 管理者でログイン | ダッシュボード表示 |
| SM-03 | 受注一覧表示 | 既存件数が見える |
| SM-04 | 1 件の詳細を開く | データ表示 |
| SM-05 | 印刷ビュー | A4 表示確認 |
| SM-06 | CloudWatch Logs / Vercel Logs | エラーなし |
| SM-07 | データベース接続 | RDS Performance Insights で活動を確認 |
| SM-08 | バックアップ設定 | Aurora 自動バックアップが ON |

---

## テスト実行ログテンプレ（Excel/Sheets/Issue 用）

| 日時 | ID | 環境 | 担当 | 結果 (P/F) | 備考 |
|---|---|---|---|---|---|
| 2026/04/26 10:00 | UT-01 | Local | 山本 | P | — |
| 2026/04/26 10:05 | FT-O02 | Local | 山本 | F | 在庫が二重減算 → Issue #12 |
