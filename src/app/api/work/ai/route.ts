import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { workAiSchema } from "@/lib/schemas";
import { polishReport } from "@/lib/worklog-ai";

/** 让 AI 整理日报的总结，整理结果直接保存 */
export const POST = route(async (req) => {
  const { date } = await readJson(req, workAiSchema);
  try {
    return await polishReport(getDb(), date);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
