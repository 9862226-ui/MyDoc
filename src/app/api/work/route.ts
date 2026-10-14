import { HttpError } from "@/lib/errors";
import { route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getWorkWeek } from "@/lib/worklog-repo";

/** 某天所在那一周的记录、项目和设置：GET /api/work?date=2026-10-10 */
export const GET = route((req) => {
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "日期格式不正确");
  return getWorkWeek(getDb(), date);
});
