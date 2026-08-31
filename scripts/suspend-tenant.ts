// Nammoku Solutions 内部運用ツール:
// 請求未入金などでテナントを一時停止する。停止後は全画面 /suspended に飛ばされ、
// ログインも拒否される（ただし /suspended と /api/auth/* は閲覧可能）。
//
// 使い方:
//   npm run suspend-tenant -- --slug nanki --reason "2026-04分 請求未入金"
//
// 引数:
//   --slug    対象テナント slug（必須）
//   --reason  停止理由メモ（必須）

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return undefined;
}

async function main() {
  const slug = arg("slug");
  const reason = arg("reason");
  if (!slug || !reason) {
    console.error("usage: npm run suspend-tenant -- --slug <slug> --reason <reason>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      console.error(`tenant not found: ${slug}`);
      process.exit(1);
    }
    const updated = await prisma.tenant.update({
      where: { slug },
      data: {
        status: "SUSPENDED",
        suspendedAt: new Date(),
        suspendedReason: reason,
      },
    });
    console.log(`✓ Suspended tenant: ${updated.name} (${updated.slug})`);
    console.log(`  reason: ${reason}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
