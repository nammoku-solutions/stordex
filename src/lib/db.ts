import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize Prisma Client");
}

const adapter = new PrismaPg({
  connectionString,
  // Lambda containers are horizontally scaled. Keep each warm container's
  // client-side pool small and let Supabase Supavisor pool server-side.
  max: process.env.AWS_LAMBDA_FUNCTION_NAME ? 1 : 5,
});

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
