import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "broker_session";

// Routes that require a valid broker session
const PROTECTED = [
  "/opportunities",
  "/vessels",
  "/vessel/",
  "/map",
  "/crm",
  "/snp",
  "/markets",
  "/alerts",
  "/weekly",
  "/compare",
  "/broker/listings",
];

function isProtected(pathname: string): boolean {
  return PROTECTED.some(p => pathname === p || pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isProtected(pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;

  if (token) {
    try {
      const secret = process.env.JWT_SECRET;
      if (secret && secret.length >= 32) {
        await jwtVerify(token, new TextEncoder().encode(secret));
        return NextResponse.next();
      }
    } catch {
      // invalid or expired token — fall through to redirect
    }
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/broker/auth";
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
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
    "/broker/listings/:path*",
  ],
};
