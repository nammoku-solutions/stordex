// Authentication checks the same Neon database; avoid cross-continent round trips.
export const preferredRegion = "sin1";

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
