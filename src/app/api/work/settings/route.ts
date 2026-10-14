import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { workSettingsSchema } from "@/lib/schemas";
import { getWorkSettings, setWorkSettings } from "@/lib/worklog-repo";

export const PUT = route(async (req) => {
  const db = getDb();
  setWorkSettings(db, await readJson(req, workSettingsSchema));
  return getWorkSettings(db);
});
