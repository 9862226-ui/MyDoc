import { idParam, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteProject, updateProject } from "@/lib/repo";
import { projectPatchSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, ctx: Ctx) => {
  updateProject(getDb(), await idParam(ctx), await readJson(req, projectPatchSchema));
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  deleteProject(getDb(), await idParam(ctx));
});
