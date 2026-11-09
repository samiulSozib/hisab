import { timingSafeEqual } from "node:crypto";
import { processDueRecurring } from "@/server/services/recurring";

/**
 * Daily Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * Recurring entries are ALSO processed whenever a user opens the dashboard, so this is a safety net.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const authorized =
    Boolean(secret) && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!authorized) return new Response("Unauthorized", { status: 401 });

  const posted = await processDueRecurring();
  return Response.json({ ok: true, posted });
}
