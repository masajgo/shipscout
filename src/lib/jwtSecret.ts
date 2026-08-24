// Resolved lazily so a missing secret fails on first auth attempt rather than at
// build time, when env vars may legitimately be absent.
let cached: Uint8Array | null = null;

const MIN_LENGTH = 32;

export function jwtSecret(): Uint8Array {
  if (cached) return cached;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set — refusing to sign or verify broker sessions");
  }
  if (secret.length < MIN_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_LENGTH} characters`);
  }

  cached = new TextEncoder().encode(secret);
  return cached;
}
