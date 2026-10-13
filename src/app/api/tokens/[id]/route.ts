import { idParam, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteToken } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (_req, ctx: Ctx) => {
  deleteToken(getDb(), await idParam(ctx));
});
