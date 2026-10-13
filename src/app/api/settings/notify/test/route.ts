import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { getNotifyConfig, sendTestMessage } from "@/lib/notify";
import { notifyConfigSchema } from "@/lib/schemas";
import { keepSecrets } from "@/lib/settings";

/** 用页面上填的设置（不用先保存）发一条测试消息 */
export const POST = route(async (req) => {
  const db = getDb();
  const config = keepSecrets(await readJson(req, notifyConfigSchema), getNotifyConfig(db), ["secret"]);
  if (!config.target) throw new HttpError(400, "请先填写推送地址");
  try {
    await sendTestMessage(db, config);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  return { ok: true };
});
