import { idParam, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteGroup, updateGroup } from "@/lib/repo";
import { groupSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, ctx: Ctx) => {
  const { name } = await readJson(req, groupSchema);
  updateGroup(getDb(), await idParam(ctx), name);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  deleteGroup(getDb(), await idParam(ctx));
});
