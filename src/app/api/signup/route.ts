import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({
  tenantName: z.string().min(1).max(100),
  tenantSlug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力値が不正です" }, { status: 400 });
  }
  const { tenantName, tenantSlug, name, email, password } = parsed.data;

  const existing = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (existing) {
    return NextResponse.json({ error: "そのテナントIDは既に使用されています" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.tenant.create({
    data: {
      name: tenantName,
      slug: tenantSlug,
      users: {
        create: {
          email: email.toLowerCase(),
          name,
          passwordHash,
          role: "OWNER",
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
