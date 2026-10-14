import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { attachmentsDir } from "./attachment-repo";
import { dataDir, type DB } from "./db";
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
  mirrorAttachments(db, dir);
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

/* ---------- 附件 ---------- */

/** 附件不随每份数据库复制，统一放在 backups/attachments 里，按内容命名，同样的文件只有一份 */
export const mirrorDir = (dir = backupDir()) => path.join(dir, "attachments");

/** 一份备份数据库里用到的附件文件 */
function filesInBackup(file: string): string[] {
  try {
    const b = new Database(file, { readonly: true, fileMustExist: true });
    try {
      return (b.prepare("SELECT file FROM attachments").all() as { file: string }[]).map((r) => r.file);
    } finally {
      b.close();
    }
  } catch {
    // 旧版本的备份里没有附件表
    return [];
  }
}

/**
 * 把附件同步到备份目录：新的复制过去（同一块硬盘上用硬链接，不多占空间），
 * 现在和保留的备份里都用不到的删掉。返回复制的个数
 */
export function mirrorAttachments(db: DB, dir = backupDir()): number {
  const target = mirrorDir(dir);
  const live = (db.prepare("SELECT file FROM attachments").all() as { file: string }[]).map((r) => r.file);
  let copied = 0;
  for (const rel of live) {
    const from = path.join(attachmentsDir(), rel);
    const to = path.join(target, rel);
    if (fs.existsSync(to) || !fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try {
      fs.linkSync(from, to);
    } catch {
      fs.copyFileSync(from, to);
    }
    copied++;
  }
  // 删掉没人用的：保留的旧备份可能还用着已经清理掉的附件
  const keep = new Set(live);
  for (const b of listBackups(dir)) for (const f of filesInBackup(path.join(dir, b.name))) keep.add(f);
  for (const sub of fs.existsSync(target) ? fs.readdirSync(target) : []) {
    const subDir = path.join(target, sub);
    if (!fs.statSync(subDir).isDirectory()) continue;
    for (const name of fs.readdirSync(subDir)) {
      if (!keep.has(`${sub}/${name}`)) fs.rmSync(path.join(subDir, name), { force: true });
    }
    if (!fs.readdirSync(subDir).length) fs.rmdirSync(subDir);
  }
  return copied;
}
