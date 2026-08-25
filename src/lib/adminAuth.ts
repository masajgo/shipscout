// Admin jobs are reachable two ways: manually with ?secret=ADMIN_SECRET, and by
// Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`.
export function authorized(req: Request, url: URL): boolean {
  const admin = process.env.ADMIN_SECRET;
  const cron  = process.env.CRON_SECRET;
  const param = url.searchParams.get("secret");
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");

  if (admin && param === admin) return true;
  if (cron && bearer === cron) return true;
  return false;
}
