import { idParam, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteSnippet, updateSnippet } from "@/lib/snippet-repo";
import { snippetPatchSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, ctx: Ctx) =>
  updateSnippet(getDb(), await idParam(ctx), await readJson(req, snippetPatchSchema)),
);

/** 删除，返回被删的内容（页面上「撤销」时用它重新创建） */
export const DELETE = route(async (_req, ctx: Ctx) => deleteSnippet(getDb(), await idParam(ctx)));
