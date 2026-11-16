/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST 4.17.1 — AWS deployment config for Stordex
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
 * AWS staging is a separate NonProd stack. See docs/AWS_STAGING_NONPROD.md.
 */
export default $config({
  app(input) {
    const isAwsStaging = input?.stage === "aws-staging";
    const stagingAccountId = process.env.STORDEX_AWS_STAGING_ACCOUNT_ID;
    if (isAwsStaging && !/^\d{12}$/.test(stagingAccountId ?? "")) {
      throw new Error("Set STORDEX_AWS_STAGING_ACCOUNT_ID to the independently verified NonProd account ID.");
    }
    return {
      name: "stordex",
      removal: input?.stage === "prod" || isAwsStaging ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "ap-northeast-1",
          ...(isAwsStaging && stagingAccountId ? { allowedAccountIds: [stagingAccountId] } : {}),
          defaultTags: {
            tags: {
              Project: "Stordex",
              Environment: input?.stage ?? "dev",
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
    const isAwsStaging = $app.stage === "aws-staging";

    // --- Network + Aurora Serverless v2 (Postgres) ---
    const vpc = new sst.aws.Vpc("Vpc", { nat: "managed" });

    const db = new sst.aws.Aurora("Db", {
      engine: "postgres",
      // Use the supported v16 LTS minor for this new stack. The legacy prod pin
      // is unchanged by the NonProd rollout and needs separate release review.
      version: isAwsStaging ? "16.8" : "16.4",
      vpc,
      // Auto-pause after idle. Min ACU controls floor cost.
      // Setting min=0 enables auto-pause on supported engine/platform versions.
      scaling: {
        min: isProd ? "0.5 ACU" : "0 ACU",
        max: isProd ? "4 ACU" : "1 ACU",
      },
      databaseName: "stordex",
      ...(isAwsStaging ? {
        transform: {
          cluster: { backupRetentionPeriod: 7 },
        },
      } : {}),
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
        ...(isAwsStaging ? { APP_ENV: "staging" } : {}),
      },
    });

    return {
      url: site.url,
      dbHost: db.host,
      dbName: db.database,
    };
  },
});
