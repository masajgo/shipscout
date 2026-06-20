import { Pool } from "pg";

// Vercel serverless: each invocation shares the module-level singleton but the
// process may be brand-new.  Keep the pool tiny (max 2) so we don't exhaust
// Supabase's connection limit across concurrent cold-starts.
//
// Worker / long-lived process sets DATABASE_POOL_MAX to a larger value.

const ssl = process.env.DATABASE_URL?.includes("supabase")
  ? { rejectUnauthorized: false }   // Supabase requires SSL; cert is self-signed on some plans
  : undefined;

const pool = new Pool({
  connectionString:        process.env.DATABASE_URL,
  max:                     parseInt(process.env.DATABASE_POOL_MAX ?? "2"),
  idleTimeoutMillis:       10_000,
  connectionTimeoutMillis: 5_000,
  ssl,
});

export default pool;
