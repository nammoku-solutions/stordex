# Database migrations

Prisma migrations are committed under `prisma/migrations`.

- Application runtime uses `DATABASE_URL` through Supabase Transaction Pooler.
- Prisma CLI uses `DIRECT_URL` when present.
- CI validates migrations against disposable PostgreSQL.
- Deployment applies migrations before updating the AWS application.

```bash
DIRECT_URL='<direct-or-session-url>' npx prisma migrate deploy
DIRECT_URL='<direct-or-session-url>' npx prisma migrate status
```

Do not use `prisma db push` for staging or production. Take a Supabase backup
before destructive migrations and deploy backward-compatible schema changes
before code that depends on them.

