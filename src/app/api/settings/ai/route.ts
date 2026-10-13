import { readJson, route } from "@/lib/api";
import { AI_SECRETS, aiReady, getAiConfig, setAiConfig } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { aiConfigSchema } from "@/lib/schemas";
import { keepSecrets, maskSecrets } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = route(() => {
  const config = getAiConfig(getDb());
  return { config: maskSecrets(config, AI_SECRETS), ready: aiReady(config) };
});

export const PUT = route(async (req) => {
  const db = getDb();
  const config = keepSecrets(await readJson(req, aiConfigSchema), getAiConfig(db), AI_SECRETS);
  setAiConfig(db, config);
  return { config: maskSecrets(config, AI_SECRETS), ready: aiReady(config) };
});
