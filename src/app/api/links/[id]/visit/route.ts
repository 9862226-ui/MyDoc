import { idParam, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { recordVisit } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req, ctx: Ctx) => {
  recordVisit(getDb(), await idParam(ctx));
});
