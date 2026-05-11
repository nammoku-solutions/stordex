import { NextResponse, type NextRequest } from "next/server";

/**
 * Coming Soon gate for the production apex domain.
 *
 * When the request hits `stordex.jp` (or `www.stordex.jp`), we hide the real app
 * and only serve the `/coming-soon` page. Any other host (Vercel preview URL,
 * `staging.stordex.jp`, localhost) passes through untouched.
 *
 * This keeps us on Vercel for the marketing page so we don't need to spin up
 * the AWS production stack yet.
 */
const COMING_SOON_HOSTS = new Set(["stordex.jp", "www.stordex.jp"]);

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (!COMING_SOON_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // Allow Next.js internals and the coming-soon page itself.
  if (
    pathname === "/coming-soon" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/coming-soon";
  url.search = "";
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on every request except static assets so we can gate the apex domain.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
