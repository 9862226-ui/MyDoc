import { idParam, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { workLogPatchSchema } from "@/lib/schemas";
import { deleteWorkLog, updateWorkLog } from "@/lib/worklog-repo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, ctx: Ctx) =>
  updateWorkLog(getDb(), await idParam(ctx), await readJson(req, workLogPatchSchema)),
);

/** 删除，返回被删的记录（页面上「撤销」时用它重新创建） */
export const DELETE = route(async (_req, ctx: Ctx) => deleteWorkLog(getDb(), await idParam(ctx)));
