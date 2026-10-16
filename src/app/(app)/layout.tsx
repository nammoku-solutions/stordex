// Keep tenant operations near the Staging Neon database (AWS Singapore).
// This route-group override does not change the marketing/public route region.
export const preferredRegion = "sin1";

import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const u = session.user;

  return (
    <AppShell
      user={{
        name: u.name,
        email: u.email,
        role: u.role,
        tenantName: u.tenantName,
      }}
    >
      {children}
    </AppShell>
  );
}
