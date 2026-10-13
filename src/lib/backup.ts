import fs from "node:fs";
import path from "node:path";
import { dataDir, getDb, type DB } from "./db";
import { localDate } from "./format";

/** 自动备份保留的份数 */
export const KEEP_BACKUPS = 7;
const NAME_RE = /^mydoc-(\d{4}-\d{2}-\d{2})-(\d{6})\.db$/;

export interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

export function backupDir(): string {
  return path.join(dataDir(), "backups");
}

export function isBackupName(name: string): boolean {
  return NAME_RE.test(name);
}

/** 备份文件列表，新的在前 */
export function listBackups(dir = backupDir()): BackupFile[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter(isBackupName);
  } catch {
    return [];
  }
  return names
    .sort()
    .reverse()
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    });
}

export function pruneBackups(dir = backupDir(), keep = KEEP_BACKUPS): void {
  for (const b of listBackups(dir).slice(keep)) fs.rmSync(path.join(dir, b.name), { force: true });
}

/** 用 SQLite 的在线备份复制整个数据库（写入中也能得到一致的快照），然后删掉多余的旧备份 */
export async function createBackup(db: DB, dir = backupDir(), now = new Date()): Promise<BackupFile> {
  fs.mkdirSync(dir, { recursive: true });
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const name = `mydoc-${localDate(now)}-${time}.db`;
  const file = path.join(dir, name);
  const tmp = `${file}.tmp`;
  await db.backup(tmp);
  fs.renameSync(tmp, file);
  pruneBackups(dir);
  const stat = fs.statSync(file);
  return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
}

/** 今天还没有备份时备份一次；返回是否新建了备份 */
export async function ensureDailyBackup(db: DB, dir = backupDir(), now = new Date()): Promise<boolean> {
  const today = localDate(now);
  if (listBackups(dir).some((b) => b.name.startsWith(`mydoc-${today}-`))) return false;
  await createBackup(db, dir, now);
  return true;
}

const globalForBackup = globalThis as unknown as { __mydocBackupStarted?: boolean };

/** 服务启动后定时检查：每天自动备份一次 */
export function startBackupSchedule(): void {
  if (globalForBackup.__mydocBackupStarted) return;
  globalForBackup.__mydocBackupStarted = true;
  const run = () =>
    ensureDailyBackup(getDb())
      .then((created) => created && console.log("[MyDoc] 已自动备份数据库"))
      .catch((e) => console.error("[MyDoc] 自动备份失败", e));
  setTimeout(run, 30_000).unref();
  setInterval(run, 3600_000).unref();
}
