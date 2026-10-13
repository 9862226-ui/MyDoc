import { readJson, route } from "@/lib/api";
import { getSyncConfig, getSyncState, setSyncConfig, SYNC_SECRETS } from "@/lib/backup-sync";
import { getDb } from "@/lib/db";
import { syncConfigSchema } from "@/lib/schemas";
import { keepSecrets, maskSecrets } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = route(() => {
  const db = getDb();
  return { config: maskSecrets(getSyncConfig(db), SYNC_SECRETS), state: getSyncState(db) };
});

export const PUT = route(async (req) => {
  const db = getDb();
  const next = keepSecrets(await readJson(req, syncConfigSchema), getSyncConfig(db), SYNC_SECRETS);
  setSyncConfig(db, next);
  return { config: maskSecrets(next, SYNC_SECRETS), state: getSyncState(db) };
});
