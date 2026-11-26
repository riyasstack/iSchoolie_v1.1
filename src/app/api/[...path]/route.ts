import type { NextRequest } from "next/server";
import { createDispatcher } from "@/server/http";
import { routes } from "@/server/api-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dispatch = createDispatcher(routes);

type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (req: NextRequest, { params }: Ctx) => dispatch(req, (await params).path);

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
