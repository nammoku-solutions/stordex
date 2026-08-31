/* eslint-disable no-console */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type SeedItem = {
  code: string;
  name: string;
  unit: string;
  stock: number;
  reorder: number;
  cost: number;
  sale: number;
};

type TenantSeed = {
  slug: string;
  name: string;
  email: string;
  ownerName: string;
  bu: {
    name: string;
    postalCode: string;
    address: string;
    phone: string;
    fax: string;
    bankInfo: string;
  };
  supplier: {
    code: string;
    name: string;
    nameKana: string;
    phone: string;
    contact: string;
  };
  customer: {
    code: string;
    name: string;
    nameKana: string;
    phone: string;
    address: string;
    contact: string;
  };
  items: SeedItem[];
  orderNumber: string;
};

const seeds: TenantSeed[] = [
  {
    slug: "demo",
    name: "デモ卸売株式会社",
    email: "admin@example.com",
    ownerName: "管理者",
    bu: {
      name: "デモ卸売株式会社 本社",
      postalCode: "100-0001",
      address: "東京都千代田区千代田1-1",
      phone: "03-0000-0000",
      fax: "03-0000-0001",
      bankInfo: "〇〇銀行 本店 普通 1234567 デモ卸売株式会社",
    },
    supplier: {
      code: "S001",
      name: "山田産業",
      nameKana: "ヤマダサンギョウ",
      phone: "06-0000-0000",
      contact: "山田 太郎",
    },
    customer: {
      code: "C001",
      name: "鈴木商店",
      nameKana: "スズキショウテン",
      phone: "03-0000-0000",
      address: "東京都港区1-2-3",
      contact: "鈴木 一郎",
    },
    items: [
      { code: "P001", name: "段ボール（小）", unit: "枚", stock: 500, reorder: 100, cost: 30, sale: 60 },
      { code: "P002", name: "段ボール（中）", unit: "枚", stock: 300, reorder: 80, cost: 50, sale: 100 },
      { code: "P003", name: "梱包テープ", unit: "巻", stock: 40, reorder: 50, cost: 120, sale: 250 },
      { code: "P004", name: "緩衝材ロール", unit: "本", stock: 15, reorder: 20, cost: 800, sale: 1500 },
    ],
    orderNumber: "SO-20260101-0001",
  },
  {
    // 2 社目: テナント分離テスト用
    // 商品コード(P001/P002)・顧客コード(C001)・仕入先コード(S001)・受注番号を
    // demo とわざと重複させ、別テナントで完全分離されることを目視確認できるようにしている。
    slug: "acme",
    name: "ACME物流株式会社",
    email: "owner@acme.example.com",
    ownerName: "ACME 管理者",
    bu: {
      name: "ACME物流株式会社 大阪支社",
      postalCode: "530-0001",
      address: "大阪府大阪市北区梅田2-2-2",
      phone: "06-1111-2222",
      fax: "06-1111-2223",
      bankInfo: "△△銀行 梅田支店 普通 7654321 ACME物流株式会社",
    },
    supplier: {
      code: "S001",
      name: "大阪ロジ部品",
      nameKana: "オオサカロジブヒン",
      phone: "06-2222-3333",
      contact: "中村 花子",
    },
    customer: {
      code: "C001",
      name: "西日本流通サービス",
      nameKana: "ニシニホンリュウツウサービス",
      phone: "06-3333-4444",
      address: "大阪府堺市1-1-1",
      contact: "佐藤 次郎",
    },
    items: [
      { code: "P001", name: "パレット（木製）", unit: "枚", stock: 200, reorder: 40, cost: 1500, sale: 2800 },
      { code: "P002", name: "ストレッチフィルム", unit: "巻", stock: 80, reorder: 30, cost: 350, sale: 700 },
      { code: "P010", name: "PPバンド", unit: "巻", stock: 60, reorder: 25, cost: 200, sale: 420 },
      { code: "P011", name: "結束機", unit: "台", stock: 5, reorder: 2, cost: 18000, sale: 32000 },
    ],
    orderNumber: "SO-20260101-0001",
  },
];

async function seedTenant(s: TenantSeed) {
  const existing = await prisma.tenant.findUnique({ where: { slug: s.slug } });
  if (existing) {
    console.log(`Tenant '${s.slug}' already exists. Skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash("password", 10);

  const tenant = await prisma.tenant.create({
    data: {
      slug: s.slug,
      name: s.name,
      plan: "standard",
      users: {
        create: {
          email: s.email,
          name: s.ownerName,
          passwordHash,
          role: "OWNER",
        },
      },
      businessUnits: {
        create: { ...s.bu, isDefault: true },
      },
    },
  });

  const supplier = await prisma.supplier.create({
    data: { tenantId: tenant.id, ...s.supplier },
  });

  const customer = await prisma.customer.create({
    data: { tenantId: tenant.id, ...s.customer },
  });

  const items = await Promise.all(
    s.items.map((p) =>
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

  const lines = [
    { item: items[0], qty: 100 },
    { item: items[1], qty: 50 },
  ];
  const subtotal = lines.reduce((sum, l) => sum + l.item.salesPrice * l.qty, 0);
  const tax = Math.floor(subtotal * 0.1);
  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      orderNumber: s.orderNumber,
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

  console.log(`✅ Seeded tenant '${s.slug}' (${s.name})`);
  console.log(`   email: ${s.email}  password: password`);
}

async function main() {
  for (const s of seeds) {
    await seedTenant(s);
  }
  console.log("---");
  console.log("ログイン情報まとめ:");
  for (const s of seeds) {
    console.log(`  - tenantSlug=${s.slug.padEnd(6)} email=${s.email.padEnd(28)} password=password`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
