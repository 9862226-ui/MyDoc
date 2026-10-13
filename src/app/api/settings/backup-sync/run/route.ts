import { readJson, route } from "@/lib/api";
import { getSyncConfig, getSyncState, setSyncConfig, SYNC_SECRETS, syncNow } from "@/lib/backup-sync";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { syncConfigSchema } from "@/lib/schemas";
import { keepSecrets, maskSecrets } from "@/lib/settings";

/** 保存设置，然后立即备份并上传一次 */
export const POST = route(async (req) => {
  const db = getDb();
  const config = keepSecrets(await readJson(req, syncConfigSchema), getSyncConfig(db), SYNC_SECRETS);
  setSyncConfig(db, config);
  let result;
  try {
    result = await syncNow(db, config);
  } catch (e) {
    // 设置不完整等，还没开始上传就出错
    throw new HttpError(400, (e as Error).message);
  }
  return { result, config: maskSecrets(config, SYNC_SECRETS), state: getSyncState(db) };
});
