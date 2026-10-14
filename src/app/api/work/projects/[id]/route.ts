import { idParam, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { workProjectPatchSchema } from "@/lib/schemas";
import { deleteWorkProject, updateWorkProject } from "@/lib/worklog-repo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, ctx: Ctx) =>
  updateWorkProject(getDb(), await idParam(ctx), await readJson(req, workProjectPatchSchema)),
);

export const DELETE = route(async (_req, ctx: Ctx) => deleteWorkProject(getDb(), await idParam(ctx)));
