import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db";
import * as repo from "./repo";
import {
  checkPassword,
  createShare,
  deleteShare,
  findShare,
  isUnlocked,
  listShares,
  sharedProject,
  unlockValue,
} from "./shares";

let db: DB;
let pid: number;
let other: number;
const base = { accessCode: "", expiresAt: null, pinned: false, favorite: false, tags: [] };

beforeEach(() => {
  db = openDb(":memory:");
  const g = repo.createGroup(db, "工作");
  pid = repo.createProject(db, { groupId: g.id, name: "官网改版", description: "2026 改版" }).id;
  other = repo.createProject(db, { groupId: g.id, name: "别的项目", description: "" }).id;
  repo.createLink(db, {
    ...base,
    url: "https://pan.baidu.com/s/1",
    title: "素材包",
    projectId: pid,
    note: "内部备注",
    accessCode: "x7k2",
  });
  const trashed = repo.createLink(db, {
    ...base,
    url: "https://a.feishu.cn/2",
    title: "已删除",
    projectId: pid,
    note: "",
  });
  repo.batchLinks(db, [trashed.id], { action: "delete" });
  repo.createLink(db, { ...base, url: "https://a.feishu.cn/3", title: "别的", projectId: other, note: "" });
});

describe("分享", () => {
  it("只包含这个项目、不在回收站的链接；备注默认不显示", () => {
    const s = createShare(db, { projectId: pid, days: null, password: "", showNotes: false });
    const found = findShare(db, s.token)!;
    const page = sharedProject(db, found.row);
    expect(page).toMatchObject({ projectName: "官网改版", groupName: "工作", description: "2026 改版" });
    expect(page.links).toEqual([
      { title: "素材包", url: "https://pan.baidu.com/s/1", accessCode: "x7k2", expiresAt: null, note: "" },
    ]);
    const withNotes = createShare(db, { projectId: pid, days: null, password: "", showNotes: true });
    expect(sharedProject(db, findShare(db, withNotes.token)!.row).links[0].note).toBe("内部备注");
  });

  it("过期、停止分享、删除项目后都打不开", () => {
    const now = new Date("2026-10-13T00:00:00Z");
    const s = createShare(db, { projectId: pid, days: 7, password: "", showNotes: false }, now);
    expect(s.expiresAt).toBe("2026-10-20T00:00:00.000Z");
    expect(findShare(db, s.token, new Date("2026-10-19T23:00:00Z"))).not.toBeNull();
    expect(findShare(db, s.token, new Date("2026-10-20T01:00:00Z"))).toBeNull();

    const s2 = createShare(db, { projectId: pid, days: null, password: "", showNotes: false });
    deleteShare(db, s2.id);
    expect(findShare(db, s2.token)).toBeNull();

    const s3 = createShare(db, { projectId: other, days: null, password: "", showNotes: false });
    repo.deleteProject(db, other);
    expect(findShare(db, s3.token)).toBeNull();
    expect(listShares(db).map((x) => x.projectId)).toEqual([pid]);
    expect(findShare(db, "../../etc")).toBeNull();
  });

  it("密码只存哈希；输对密码后的 Cookie 才能打开", () => {
    const s = createShare(db, { projectId: pid, days: null, password: "1234", showNotes: false });
    expect(s.hasPassword).toBe(true);
    const { row } = findShare(db, s.token)!;
    expect(row.password_hash).not.toContain("1234");
    expect(checkPassword(row.password_hash!, "1234")).toBe(true);
    expect(checkPassword(row.password_hash!, "12345")).toBe(false);
    expect(isUnlocked(row, undefined)).toBe(false);
    expect(isUnlocked(row, "guess")).toBe(false);
    expect(isUnlocked(row, unlockValue(row))).toBe(true);
    // 另一个分享的 Cookie 不能通用
    const s2 = createShare(db, { projectId: pid, days: null, password: "1234", showNotes: false });
    expect(isUnlocked(findShare(db, s2.token)!.row, unlockValue(row))).toBe(false);
  });
});
