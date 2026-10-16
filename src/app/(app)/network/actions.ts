"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { orderedTenantPair } from "@/lib/trading-connections";

function requireManager(role: string) {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new Error("企業間接続の管理には管理者権限が必要です");
  }
}

export async function requestTradingConnection(formData: FormData) {
  const { tenantId, role } = await requireTenant();
  requireManager(role);
  const partnerSlug = String(formData.get("partnerSlug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(partnerSlug)) {
    redirect("/network?notice=invalid");
  }
  const partner = await prisma.tenant.findFirst({
    where: { slug: partnerSlug, status: "ACTIVE" },
    select: { id: true },
  });
  if (!partner || partner.id === tenantId) {
    redirect("/network?notice=not-found");
  }
  const [tenantAId, tenantBId] = orderedTenantPair(tenantId, partner.id);
  const existing = await prisma.tradingConnection.findUnique({
    where: { tenantAId_tenantBId: { tenantAId, tenantBId } },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === "ACTIVE" || existing.status === "PENDING") {
      redirect("/network?notice=already");
    }
    const updated = await prisma.tradingConnection.updateMany({
      where: { id: existing.id, status: { in: ["DECLINED", "REVOKED"] } },
      data: { status: "PENDING", requestedByTenantId: tenantId },
    });
    if (!updated.count) redirect("/network?notice=already");
  } else {
    // The unique tenant-pair index prevents duplicate simultaneous requests.
    await prisma.tradingConnection.create({
      data: { tenantAId, tenantBId, requestedByTenantId: tenantId },
    });
  }
  revalidatePath("/network");
  redirect("/network?notice=invited");
}

export async function respondTradingConnection(formData: FormData) {
  const { tenantId, role } = await requireTenant();
  requireManager(role);
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || !["accept", "decline"].includes(decision)) {
    redirect("/network?notice=invalid");
  }
  const updated = await prisma.tradingConnection.updateMany({
    where: {
      id,
      status: "PENDING",
      requestedByTenantId: { not: tenantId },
      OR: [{ tenantAId: tenantId }, { tenantBId: tenantId }],
    },
    data: { status: decision === "accept" ? "ACTIVE" : "DECLINED" },
  });
  if (!updated.count) redirect("/network?notice=invalid");
  revalidatePath("/network");
  redirect("/network?notice=" + (decision === "accept" ? "accepted" : "declined"));
}

export async function revokeTradingConnection(formData: FormData) {
  const { tenantId, role } = await requireTenant();
  requireManager(role);
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/network?notice=invalid");
  const updated = await prisma.tradingConnection.updateMany({
    where: {
      id,
      status: "ACTIVE",
      OR: [{ tenantAId: tenantId }, { tenantBId: tenantId }],
    },
    data: { status: "REVOKED" },
  });
  if (!updated.count) redirect("/network?notice=invalid");
  revalidatePath("/network");
  redirect("/network?notice=revoked");
}
