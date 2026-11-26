import { after, type NextRequest } from "next/server";
import { createDispatcher } from "@/server/http";
import { routes } from "@/server/api-routes";
import { runDueJobs, shouldRunInlineJobs } from "@/server/jobs";
import { log } from "@/server/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dispatch = createDispatcher(routes);

type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (req: NextRequest, { params }: Ctx) => {
  const res = await dispatch(req, (await params).path);
  // Serverless hosting (INLINE_JOBS=true): run due jobs after the response is sent.
  if (shouldRunInlineJobs()) {
    after(() =>
      runDueJobs(`inline:${crypto.randomUUID().slice(0, 8)}`, { maxJobs: 10, budgetMs: 10_000 }).catch((e) =>
        log("error", "inline_jobs_failed", { error: e instanceof Error ? e.message : String(e) }),
      ),
    );
  }
  return res;
};

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
