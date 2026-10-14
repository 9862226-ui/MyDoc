import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { applyPlanOp, getDayPlan } from "@/lib/dayplan-repo";
import { HttpError } from "@/lib/errors";
import { dayPlanOpSchema } from "@/lib/schemas";

/** 某天的计划，以及开工时可以挑的事：GET /api/work/plan?date=2026-10-14 */
export const GET = route(async (req) => {
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "日期格式不正确");
  return getDayPlan(getDb(), date);
});

/** 改计划：加几条、打勾、顺延、不做了、收工…… */
export const POST = route(async (req) => {
  const { date, ...op } = await readJson(req, dayPlanOpSchema);
  return applyPlanOp(getDb(), date, op);
});
