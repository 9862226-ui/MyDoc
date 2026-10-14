import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { workRemindTestSchema } from "@/lib/schemas";
import { sendTestRemind } from "@/lib/worklog-remind";

/** 发一条测试提醒 */
export const POST = route(async (req) => {
  const { kind } = await readJson(req, workRemindTestSchema);
  try {
    await sendTestRemind(getDb(), kind);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
