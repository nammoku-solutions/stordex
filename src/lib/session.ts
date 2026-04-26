import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Returns the current authenticated session, or redirects to /login.
 * Use in server components and server actions to enforce tenant scope.
 * Also blocks access if the tenant is SUSPENDED/TERMINATED (未入金等).
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  // テナントの利用状態をリクエスト毎に検査（選択的にキャッシュしたければ上位で）
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { status: true },
  });
  if (!tenant || tenant.status !== "ACTIVE") {
    redirect("/suspended");
  }
  return session;
}

export async function requireTenant() {
  const session = await requireSession();
  return {
    session,
    tenantId: session.user.tenantId,
    userId: session.user.id,
    role: session.user.role,
  };
}
