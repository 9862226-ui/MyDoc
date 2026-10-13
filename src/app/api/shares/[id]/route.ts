import { idParam, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteShare } from "@/lib/shares";

type Ctx = { params: Promise<{ id: string }> };

/** 停止分享：链接立即失效 */
export const DELETE = route(async (_req, ctx: Ctx) => {
  deleteShare(getDb(), await idParam(ctx));
});
