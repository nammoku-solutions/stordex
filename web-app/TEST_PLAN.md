# テスト計画（Test Plan）

## テストレベル一覧

| レベル | 目的 | 担当 | 環境 | ツール |
|---|---|---|---|---|
| **単体テスト (UT)** | 関数単位のロジック検証 | 開発者 | Local | Vitest |
| **結合テスト (IT)** | DB + Server Action + Prisma の連携 | 開発者 | Local | Vitest + 専用テスト DB（任意） |
| **機能テスト (FT)** | 画面 1 機能のシナリオ検証 | 開発者 / QA | Local | 手動 + ブラウザ |
| **総合テスト (ST / UAT)** | エンドツーエンド業務フロー / 性能 / 帯域 / 認可 | クライアント / QA | Staging | 手動 + ブラウザ |
| **本番受入テスト (Smoke)** | 本番デプロイ直後の最低限動作確認 | 運用 | Production | 手動 |

## テスト対象モジュール

1. 認証 (NextAuth Credentials)
2. テナント分離 (multi-tenant)
3. マスタ: 顧客 / 仕入先 / 商品 / 事業所 / 倉庫
4. 受注 (Order) — ステータス遷移、在庫減算、印刷
5. 見積書 (Quotation)
6. 仕入先発注 (PurchaseOrder) — 入荷で在庫加算
7. 月次請求書 (Invoice) — 受注集約、税切替
8. 在庫 (InventoryMovement) — 入庫/出庫/調整、ロット/賞味期限/棚番
9. レポート — 月次商品別売上
10. 旧 XML データ取り込み
11. 印刷ビュー（納品書 / ピッキング / 見積書 / 発注書 / 請求書）

## 合否判定基準

- 各レベル **重要度 High のケースが 100% 合格** で次レベルに進む
- High = データ破損 / 認可漏れ / 金額誤差 / 在庫整合性に関わる
- Medium = UI 表示 / バリデーション
- Low = 文言・レイアウトの細部

## 実行サイクル

```
[コード変更]
  └─ npm run typecheck
  └─ npm run lint
  └─ npm test                   ← UT + IT (Local)
  └─ git push (feature → develop)
       └─ Vercel Preview Deploy
            └─ FT / ST (Staging)  ← クライアント確認
                 └─ git push main
                      └─ npx sst deploy --stage prod
                           └─ Smoke (Production)
```

## ツール

- 単体・結合: **Vitest** (`npm test`)
- 型: `npm run typecheck`
- Lint: `npm run lint`
- 機能・総合: 手動チェックリスト（[TEST_CASES.md](TEST_CASES.md)）
- E2E 自動化（任意・将来）: Playwright を `e2e/` に追加可能

## テスト環境のデータ

| 環境 | データ |
|---|---|
| Local UT/IT | Vitest がインメモリで生成、または `stordex_test` 専用 DB |
| Local FT | `npm run db:seed` のデモデータ |
| Staging ST | 本番想定の匿名化データを Neon に投入 |
| Production Smoke | 本物データ（破壊的操作禁止） |
