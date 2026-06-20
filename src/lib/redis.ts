import Redis from "ioredis";

// Upstash URLs start with rediss:// (TLS required).
// ioredis enables TLS automatically for rediss:// but needs an explicit tls:{} object
// when the host uses a self-signed cert — Upstash uses a valid cert so {} is enough.

let redis: Redis | null = null;

if (process.env.REDIS_URL) {
  const isTLS = process.env.REDIS_URL.startsWith("rediss://");
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck:     false,
    lazyConnect:          true,
    tls:                  isTLS ? {} : undefined,
  });
  redis.on("error", () => {});
}

export default redis;
