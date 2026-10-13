import { route } from "@/lib/api";
import { createBackup, KEEP_BACKUPS, listBackups } from "@/lib/backup";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = route(() => ({ backups: listBackups(), keep: KEEP_BACKUPS }));

/** 立即备份 */
export const POST = route(() => createBackup(getDb()));
