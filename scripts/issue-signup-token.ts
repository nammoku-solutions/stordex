// Nammoku Solutions 内部運用ツール:
// 入金確認後にこのスクリプトで招待トークンを発行し、顧客にメール送付する。
//
// 使い方 (リポジトリ直下で):
//   npx tsx scripts/issue-signup-token.ts \
//     --company "南紀運輸" \
//     --slug "nanki" \
//     --email "owner@example.com" \
//     --plan "standard" \
//     --days 14
//
// 引数:
//   --company    顧客会社名 (任意, 管理メモ)
//   --slug       事前に固定するテナントslug (任意。指定すると顧客はこのslugしか使えない)
//   --email      事前に固定する管理者メール (任意)
//   --plan       プラン名 (任意, デフォルト "standard")
//   --days       有効期限（日数, デフォルト 30）
//   --note       メモ (任意)
//
// 出力: 招待 URL を表示。これを顧客にメール送付。

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

async function main() {
  const company = arg("company");
  const slug = arg("slug");
  const email = arg("email");
  const plan = arg("plan") ?? "standard";
  const days = Number(arg("days") ?? "30");
  const note = arg("note");

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const token = randomBytes(24).toString("base64url"); // 32文字程度
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const prisma = createPrismaClient();
  try {
    const invite = await prisma.signupInvitation.create({
      data: {
        token,
        companyName: company,
        allowedTenantSlug: slug,
        allowedEmail: email?.toLowerCase(),
        plan,
        note,
        expiresAt,
        createdBy: process.env.USER ?? "cli",
      },
    });

    const url = `${baseUrl}/signup?token=${encodeURIComponent(token)}`;

    console.log("\n✅ 招待トークンを発行しました\n");
    console.log("  ID         :", invite.id);
    console.log("  会社名     :", company ?? "(未指定)");
    console.log("  Slug 制約  :", slug ?? "(自由)");
    console.log("  Email 制約 :", email ?? "(自由)");
    console.log("  Plan       :", plan);
    console.log("  有効期限   :", expiresAt.toISOString());
    console.log("\n以下の URL を顧客にメール送付してください:\n");
    console.log("  " + url + "\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
