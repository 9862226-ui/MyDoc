import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { projectUpdateSchema } from "@/lib/schemas";
import { deleteProjectUpdate, setProjectUpdate } from "@/lib/worklog-repo";

/** 写某个报工项目某一周的进展（状态和说明）；已有的覆盖 */
export const PUT = route(async (req) => setProjectUpdate(getDb(), await readJson(req, projectUpdateSchema)));

/** 清除某一周的进展：DELETE /api/work/project-updates?projectId=1&week=2026-10-12 */
export const DELETE = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const projectId = Number(q.get("projectId"));
  const week = q.get("week") ?? "";
  if (!Number.isInteger(projectId) || projectId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    throw new HttpError(400, "参数不正确");
  }
  deleteProjectUpdate(getDb(), projectId, week);
  return { ok: true };
});
