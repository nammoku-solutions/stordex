import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      tenantId: string;
      tenantSlug: string;
      tenantName: string;
      role: "OWNER" | "ADMIN" | "STAFF";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    role: "OWNER" | "ADMIN" | "STAFF";
  }
}
