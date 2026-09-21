/// <reference path="./.sst/platform/config.d.ts" />

/** AWS serverless deployment. PostgreSQL remains in Supabase. */
export default $config({
  app(input) {
    return {
      name: "stordex",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "ap-southeast-2",
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
    const databaseUrl = new sst.Secret("DatabaseUrl");
    const nextAuthSecret = new sst.Secret("NextAuthSecret");
    const nextAuthUrl = new sst.Secret("NextAuthUrl");
    const domain = process.env.APP_DOMAIN;

    const site = new sst.aws.Nextjs("Web", {
      path: ".",
      ...(domain ? { domain } : {}),
      link: [databaseUrl, nextAuthSecret, nextAuthUrl],
      environment: {
        DATABASE_URL: databaseUrl.value,
        NEXTAUTH_SECRET: nextAuthSecret.value,
        NEXTAUTH_URL: nextAuthUrl.value,
        APP_ENV: $app.stage,
      },
    });

    return { url: site.url, stage: $app.stage };
  },
});
