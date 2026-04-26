import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

/**
 * Returns the current authenticated session, or redirects to /login.
 * Use in server components and server actions to enforce tenant scope.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
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
