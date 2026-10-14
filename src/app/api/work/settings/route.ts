import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { workSettingsSchema } from "@/lib/schemas";
import { getWorkSettings, setWorkSettings } from "@/lib/worklog-repo";

/** 合并保存：只传要改的字段 */
export const PUT = route(async (req) => {
  const db = getDb();
  const patch = await readJson(req, workSettingsSchema);
  const next = { ...getWorkSettings(db), ...patch };
  next.remindDays = [...new Set(next.remindDays)].sort();
  setWorkSettings(db, next);
  return next;
});
