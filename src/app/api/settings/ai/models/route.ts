import { readJson, route } from "@/lib/api";
import { AI_SECRETS, getAiConfig, listModels } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { aiConfigSchema } from "@/lib/schemas";
import { keepSecrets } from "@/lib/settings";

/** 获取服务商的模型列表 */
export const POST = route(async (req) => {
  const config = keepSecrets(await readJson(req, aiConfigSchema), getAiConfig(getDb()), AI_SECRETS);
  try {
    return { models: await listModels(config) };
  } catch (e) {
    throw new HttpError(400, `获取模型列表失败：${(e as Error).message}。可以直接在控制台查到模型名后手动填写`);
  }
});
