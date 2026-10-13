import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBackup, ensureDailyBackup, isBackupName, listBackups, pruneBackups } from "./backup";
import { openDb, type DB } from "./db";
import { createGroup } from "./repo";

let tmp: string;
let db: DB;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mydoc-backup-"));
  db = openDb(path.join(tmp, "mydoc.db"));
  createGroup(db, "工作");
});
afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("备份", () => {
  it("备份文件是完整可用的数据库", async () => {
    const dir = path.join(tmp, "backups");
    const b = await createBackup(db, dir, new Date(2026, 9, 13, 8, 5, 9));
    expect(b.name).toBe("mydoc-2026-10-13-080509.db");
    const copy = new Database(path.join(dir, b.name), { readonly: true });
    expect(copy.prepare("SELECT name FROM link_groups").get()).toEqual({ name: "工作" });
    copy.close();
  });

  it("每天只自动备份一次", async () => {
    const dir = path.join(tmp, "backups");
    expect(await ensureDailyBackup(db, dir, new Date(2026, 9, 13, 1))).toBe(true);
    expect(await ensureDailyBackup(db, dir, new Date(2026, 9, 13, 23))).toBe(false);
    expect(await ensureDailyBackup(db, dir, new Date(2026, 9, 14, 0, 30))).toBe(true);
    expect(listBackups(dir).map((b) => b.name)).toEqual(["mydoc-2026-10-14-003000.db", "mydoc-2026-10-13-010000.db"]);
  });

  it("只保留最新的几份", async () => {
    const dir = path.join(tmp, "backups");
    for (let d = 1; d <= 9; d++) await createBackup(db, dir, new Date(2026, 9, d, 2));
    expect(listBackups(dir)).toHaveLength(7);
    pruneBackups(dir, 2);
    expect(listBackups(dir).map((b) => b.name)).toEqual(["mydoc-2026-10-09-020000.db", "mydoc-2026-10-08-020000.db"]);
  });

  it("文件名校验防止下载任意文件", () => {
    expect(isBackupName("mydoc-2026-10-13-080509.db")).toBe(true);
    expect(isBackupName("../mydoc.db")).toBe(false);
    expect(isBackupName("mydoc.db")).toBe(false);
  });
});
