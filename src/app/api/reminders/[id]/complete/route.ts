import { z } from "zod";
import { idParam, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { completeReminder } from "@/lib/reminder-repo";

type Ctx = { params: Promise<{ id: string }> };

/** 处理完：重复的顺延到下一个周期，不重复的标记为已完成 */
export const POST = route(async (req, ctx: Ctx) => {
  await readJson(req, z.object({}));
  return completeReminder(getDb(), await idParam(ctx));
});
