import { readJson, route } from "@/lib/api";
import { AI_SECRETS, getAiConfig, testModel } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { aiConfigSchema } from "@/lib/schemas";
import { keepSecrets } from "@/lib/settings";

/** 用页面上填的设置（不用先保存）测试能不能调通 */
export const POST = route(async (req) => {
  const config = keepSecrets(await readJson(req, aiConfigSchema), getAiConfig(getDb()), AI_SECRETS);
  try {
    return await testModel(config);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
