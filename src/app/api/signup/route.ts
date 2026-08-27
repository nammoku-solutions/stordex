import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({
  token: z.string().min(8).max(128),
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

class InvitationAlreadyUsedError extends Error {}

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
  const { token, tenantName, tenantSlug, name, email, password } = parsed.data;

  const invite = await prisma.signupInvitation.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json(
      { error: "招待コードが無効です。Nammoku Solutions までお問い合わせください。" },
      { status: 403 }
    );
  }
  if (invite.usedAt) {
    return NextResponse.json(
      { error: "この招待コードは既に使用されています。" },
      { status: 403 }
    );
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "招待コードの有効期限が切れています。" },
      { status: 403 }
    );
  }
  if (invite.allowedTenantSlug && invite.allowedTenantSlug !== tenantSlug) {
    return NextResponse.json(
      { error: "このトークンでは指定されたテナントIDのみ利用可能です。" },
      { status: 403 }
    );
  }
  if (invite.allowedEmail && invite.allowedEmail.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json(
      { error: "このトークンでは指定されたメールアドレスのみ利用可能です。" },
      { status: 403 }
    );
  }

  const existing = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (existing) {
    return NextResponse.json({ error: "そのテナントIDは既に使用されています" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug: tenantSlug,
          plan: invite.plan,
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

      const claimed = await tx.signupInvitation.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date(), usedByTenantId: tenant.id },
      });
      if (claimed.count !== 1) {
        throw new InvitationAlreadyUsedError();
      }
    });
  } catch (error) {
    if (error instanceof InvitationAlreadyUsedError) {
      return NextResponse.json(
        { error: "この招待コードは既に使用されています。" },
        { status: 403 }
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
