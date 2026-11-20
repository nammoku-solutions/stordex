import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { b2bReturnFormsEnabled } from "@/lib/b2b-return-feature";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const u = session.user;

  return (
    <AppShell
      returnsEnabled={b2bReturnFormsEnabled()}
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
