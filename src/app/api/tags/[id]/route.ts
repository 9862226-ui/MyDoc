import { idParam, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteTag, renameTag } from "@/lib/repo";
import { tagRenameSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, ctx: Ctx) => {
  const { name } = await readJson(req, tagRenameSchema);
  renameTag(getDb(), await idParam(ctx), name);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  deleteTag(getDb(), await idParam(ctx));
});
