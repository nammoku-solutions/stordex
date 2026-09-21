import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // DIRECT_URL is intended for migrations. Runtime uses pooled DATABASE_URL.
    url: process.env.DIRECT_URL ?? env("DATABASE_URL"),
  },
});
