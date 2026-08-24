import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { jwtSecret } from "./jwtSecret";

const COOKIE = "broker_session";
const TTL    = 60 * 60 * 24 * 14; // 14 days

export type BrokerSession = {
  id:       string;
  email:    string;
  fullName: string | null;
  company:  string | null;
};

export async function signSession(payload: BrokerSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(jwtSecret());
}

export async function getSession(): Promise<BrokerSession | null> {
  try {
    const jar   = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, jwtSecret());
    return payload as unknown as BrokerSession;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(token: string) {
  return {
    name:     COOKIE,
    value:    token,
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path:     "/",
    maxAge:   TTL,
  };
}

export function clearCookieOptions() {
  return { name: COOKIE, value: "", maxAge: 0, path: "/" };
}
