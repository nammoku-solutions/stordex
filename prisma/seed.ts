/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const slug = "demo";
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Tenant '${slug}' already exists. Skipping seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash("password", 10);

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: "デモ卸売株式会社",
      plan: "standard",
      users: {
        create: {
          email: "admin@example.com",
          name: "管理者",
          passwordHash,
          role: "OWNER",
        },
      },
      businessUnits: {
        create: {
          name: "デモ卸売株式会社 本社",
          postalCode: "100-0001",
          address: "東京都千代田区千代田1-1",
          phone: "03-0000-0000",
          fax: "03-0000-0001",
          bankInfo: "〇〇銀行 本店 普通 1234567 デモ卸売株式会社",
          isDefault: true,
        },
      },
    },
  });

  const supplier = await prisma.supplier.create({
    data: {
      tenantId: tenant.id,
      code: "S001",
      name: "山田産業",
      nameKana: "ヤマダサンギョウ",
      phone: "06-0000-0000",
      contact: "山田 太郎",
    },
  });

  const customer = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      code: "C001",
      name: "鈴木商店",
      nameKana: "スズキショウテン",
      phone: "03-0000-0000",
      address: "東京都港区1-2-3",
      contact: "鈴木 一郎",
    },
  });

  const items = await Promise.all(
    [
      { code: "P001", name: "段ボール（小）", unit: "枚", stock: 500, reorder: 100, cost: 30, sale: 60 },
      { code: "P002", name: "段ボール（中）", unit: "枚", stock: 300, reorder: 80, cost: 50, sale: 100 },
      { code: "P003", name: "梱包テープ", unit: "巻", stock: 40, reorder: 50, cost: 120, sale: 250 },
      { code: "P004", name: "緩衝材ロール", unit: "本", stock: 15, reorder: 20, cost: 800, sale: 1500 },
    ].map((p) =>
      prisma.item.create({
        data: {
          tenantId: tenant.id,
          code: p.code,
          name: p.name,
          unit: p.unit,
          stock: p.stock,
          reorderPoint: p.reorder,
          costPrice: p.cost,
          salesPrice: p.sale,
          supplierId: supplier.id,
        },
      })
    )
  );

  // Sample order
  const lines = [
    { item: items[0], qty: 100 },
    { item: items[1], qty: 50 },
  ];
  const subtotal = lines.reduce((s, l) => s + l.item.salesPrice * l.qty, 0);
  const tax = Math.floor(subtotal * 0.1);
  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      orderNumber: "SO-20250101-0001",
      customerId: customer.id,
      orderDate: new Date(),
      status: "DRAFT",
      subtotal,
      taxRate: 10,
      tax,
      total: subtotal + tax,
      items: {
        create: lines.map((l) => ({
          itemId: l.item.id,
          itemName: l.item.name,
          unit: l.item.unit,
          quantity: l.qty,
          unitPrice: l.item.salesPrice,
          amount: l.item.salesPrice * l.qty,
        })),
      },
    },
  });

  console.log("✅ Seed complete.");
  console.log(`   Tenant slug: ${slug}`);
  console.log(`   Email:       admin@example.com`);
  console.log(`   Password:    password`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
