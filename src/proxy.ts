import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { jwtSecret } from "./lib/jwtSecret";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/broker/auth") return NextResponse.next();

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
  matcher: ["/broker/:path*"],
};
