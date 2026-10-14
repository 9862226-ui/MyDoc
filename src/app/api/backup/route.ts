import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { importBackup } from "@/lib/repo";
import { backupSchema } from "@/lib/schemas";
import { DEFAULT_WORK_SETTINGS } from "@/lib/worklog";
import { importWork } from "@/lib/worklog-repo";

/** 从 JSON 备份恢复（合并，不会删除现有数据） */
export const POST = route(async (req) => {
  const db = getDb();
  const backup = await readJson(req, backupSchema);
  const result = importBackup(db, backup);
  const work = backup.work
    ? importWork(db, { ...backup.work, settings: { ...DEFAULT_WORK_SETTINGS, ...backup.work.settings } })
    : 0;
  return { ...result, work };
});
