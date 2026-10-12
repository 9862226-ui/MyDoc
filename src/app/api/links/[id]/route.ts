import { idParam, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { fallbackTitle } from "@/lib/platforms";
import { batchLinks, getLink, updateLink } from "@/lib/repo";
import { linkPatchSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, ctx: Ctx) => {
  const id = await idParam(ctx);
  const patch = await readJson(req, linkPatchSchema);
  const db = getDb();
  if (patch.title === "") patch.title = fallbackTitle(patch.url ?? getLink(db, id).url);
  return updateLink(db, id, patch);
});

/** 移到回收站 */
export const DELETE = route(async (_req, ctx: Ctx) => {
  batchLinks(getDb(), [await idParam(ctx)], { action: "delete" });
});
