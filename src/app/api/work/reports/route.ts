import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { workReportSchema } from "@/lib/schemas";
import { weekStart } from "@/lib/worklog";
import { setReportFields } from "@/lib/worklog-repo";

/** 保存手动改过的日报、周报字段；字段为 null 表示恢复自动生成 */
export const PUT = route(async (req) => {
  const { kind, key, fields } = await readJson(req, workReportSchema);
  return setReportFields(getDb(), kind, kind === "weekly" ? weekStart(key) : key, fields);
});
