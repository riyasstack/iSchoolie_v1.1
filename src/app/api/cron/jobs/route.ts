/**
 * Serverless job runner, called by Vercel Cron (vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; anything else is refused. Runs due jobs
 * (scheduled posts, link previews, cleanup) and makes sure cleanup stays scheduled.
 */
import { NextResponse, type NextRequest } from "next/server";
import { runDueJobs, scheduleCleanup } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not allowed." } }, { status: 403 });
  }
  await scheduleCleanup(0);
  const ran = await runDueJobs(`cron:${crypto.randomUUID().slice(0, 8)}`, { maxJobs: 100, budgetMs: 50_000 });
  return NextResponse.json({ data: { ran } }, { headers: { "cache-control": "no-store" } });
}
