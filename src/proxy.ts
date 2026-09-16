import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { jwtSecret } from "./lib/jwtSecret";

const ADMIN_ALLOWED_IPS = (process.env.ADMIN_ALLOWED_IPS ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/broker/auth") return NextResponse.next();

  // Admin pages: IP-only access — return 404 to unknown IPs
  if (pathname.startsWith("/admin")) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
            ?? request.headers.get("x-real-ip")
            ?? "";
    if (ADMIN_ALLOWED_IPS.length && !ADMIN_ALLOWED_IPS.includes(ip)) {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next();
  }

  const token = request.cookies.get("broker_session")?.value;
  let valid   = false;

  if (token) {
    try { await jwtVerify(token, jwtSecret()); valid = true; } catch {}
  }

  if (!valid) {
    const url = request.nextUrl.clone();
    url.pathname = "/broker/auth";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/broker/:path*",
    "/opportunities/:path*",
    "/vessels/:path*",
    "/vessel/:path*",
    "/map/:path*",
    "/crm/:path*",
    "/snp/:path*",
    "/markets/:path*",
    "/alerts/:path*",
    "/weekly/:path*",
    "/compare/:path*",
  ],
};
