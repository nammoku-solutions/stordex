# Stordex Security and Maintenance Notes

この文書は Stordex の保守時に壊してはいけないセキュリティ境界と、変更レビュー時の確認事項をまとめたものです。

## Tenant isolation

Stordex の最重要セキュリティ境界は Tenant です。

サーバー処理では次を守ってください。

- tenant ID を request body / query / form input から受け取って認可に使用しない
- `requireTenant()` から得た `tenantId` を使用する
- detail/update/delete は `id` だけでなく `tenantId` でも scope する
- relation ID (`customerId`, `supplierId`, `itemId`, `businessUnitId` など) は現在の tenant に属することを検証する
- UI 上で選択肢を絞るだけで安全とみなさない

新しい cross-record write を追加するときは `src/lib/tenant-resources.ts` のガードを利用するか、同等の tenant ownership check を実装してください。

## Authentication

- Credentials login は tenant slug + email + password
- password verification は bcrypt
- JWT session の max age は 8 時間
- Tenant status は `requireSession()` で request ごとに確認
- SUSPENDED / TERMINATED Tenant は業務利用不可

`NEXTAUTH_SECRET` は repository に保存せず、環境ごとの secret store を使用してください。

## Authorization

ロールは `OWNER`, `ADMIN`, `STAFF` です。

現行アプリは Tenant 分離を中心に設計されており、すべての機能で細かな RBAC が完成しているわけではありません。管理操作を追加する場合は UI と server の両方で role を確認してください。

legacy XML import は `OWNER` / `ADMIN` のみに制限します。

## Signup invitations

Signup invitation は bearer credential として扱います。

- token をログへ出力しない
- expiry / allowed tenant / allowed email を検証する
- Tenant 作成と invitation の使用済み claim は同一 transaction で行う
- used token を再利用させない

## Legacy XML import

XML import は既存データへ多数の record を作成できる高権限操作です。

- OWNER / ADMIN only
- request size / file size を制限
- XML entity processing を無効化
- import 先は current tenant のみ
- production import 前に backup と staging validation を推奨

## Dependency security

CI は production dependency に対して次を blocking check とします。

```bash
npm audit --omit=dev --audit-level=low
```

full dependency audit もレポートします。dev-only advisory は exploitability と開発環境への影響を確認し、無理な `npm audit fix --force` は行わないでください。

## CI/CD secrets

GitHub Actions、Vercel、SST/AWS の credential を repository に直接保存しないでください。

現行 AWS production workflow は GitHub Secrets の access key を利用しています。実 AWS 側の IAM 準備後、GitHub OIDC + least-privilege role へ移行するのが推奨です。

## Database changes

現行 repository には migration history がありません。production schema が存在する場合、新しい `prisma/migrations` を作ってそのまま適用しないでください。

production DB の schema / data / backup を確認した上で baseline を作成してください。

## Review checklist

Security-sensitive change では最低限次を確認します。

- tenant scope がすべての read/write にあるか
- relation ID が cross-tenant reference を作れないか
- destructive/admin 操作に server-side authorization があるか
- secret/token/password を log や client bundle へ出していないか
- upload/import body size が bounded か
- dependency audit が通るか
- typecheck/test/build が通るか
- production deploy が意図しないタイミングで実行されないか

脆弱性報告を公開 Issue に秘密情報付きで投稿しないでください。秘密情報が含まれる場合は repository 管理者へ非公開経路で連絡してください。
