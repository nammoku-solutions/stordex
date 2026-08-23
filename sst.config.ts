/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST v3 (Ion) — AWS deployment config for Stordex
 *
 * What gets created (prod):
 *   - VPC (2 AZs, NAT)
 *   - Aurora Serverless v2 (PostgreSQL 16)  — DB engine selected by user
 *   - Next.js app on Lambda + CloudFront + S3 (via OpenNext)
 *
 * Deploy:
 *   npx sst secret set NextAuthSecret "$(openssl rand -base64 32)" --stage prod
 *   npx sst secret set NextAuthUrl    "https://<cloudfront-domain>"  --stage prod   # set after first deploy
 *   npx sst deploy --stage prod
 *
 * Local dev (no AWS resources): use a local/Neon DB and `npm run dev`.
 */
export default $config({
  app(input) {
    return {
      name: "stordex",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "ap-northeast-1",
          defaultTags: {
            tags: {
              Project: "Stordex",
              Environment: "prod",
              ManagedBy: "SST",
              Owner: "NammokuSolutions",
            },
          },
        },
      },
    };
  },
  async run() {
    const isProd = $app.stage === "prod";

    // --- Network + Aurora Serverless v2 (Postgres) ---
    const vpc = new sst.aws.Vpc("Vpc", { nat: "managed" });

    const db = new sst.aws.Aurora("Db", {
      engine: "postgres",
      version: "16.4",
      vpc,
      // Auto-pause after idle. Min ACU controls floor cost.
      // Setting min=0 enables full pause (cold start ~ a few seconds).
      scaling: {
        min: isProd ? "0.5 ACU" : "0 ACU",
        max: isProd ? "4 ACU" : "1 ACU",
      },
      databaseName: "stordex",
    });

    // --- Secrets ---
    const nextAuthSecret = new sst.Secret("NextAuthSecret");
    // NEXTAUTH_URL is set after first deploy when CloudFront URL is known.
    const nextAuthUrl = new sst.Secret("NextAuthUrl");

    // --- Next.js app ---
    const site = new sst.aws.Nextjs("Web", {
      path: ".",
      vpc,
      link: [db, nextAuthSecret, nextAuthUrl],
      environment: {
        // Prisma reads DATABASE_URL — built from the linked Aurora cluster.
        DATABASE_URL: $interpolate`postgresql://${db.username}:${db.password}@${db.host}:${db.port}/${db.database}?sslmode=require`,
        NEXTAUTH_SECRET: nextAuthSecret.value,
        NEXTAUTH_URL: nextAuthUrl.value,
      },
    });

    return {
      url: site.url,
      dbHost: db.host,
      dbName: db.database,
    };
  },
});
