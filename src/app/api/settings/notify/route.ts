import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getNotifyConfig, getNotifyState, setNotifyConfig } from "@/lib/notify";
import { notifyConfigSchema } from "@/lib/schemas";
import { keepSecrets, maskSecrets } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = route(() => {
  const db = getDb();
  return { config: maskSecrets(getNotifyConfig(db), ["secret"]), state: getNotifyState(db) };
});

export const PUT = route(async (req) => {
  const db = getDb();
  const next = keepSecrets(await readJson(req, notifyConfigSchema), getNotifyConfig(db), ["secret"]);
  setNotifyConfig(db, next);
  return { config: maskSecrets(next, ["secret"]), state: getNotifyState(db) };
});
