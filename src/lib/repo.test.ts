import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db";
import * as repo from "./repo";

let db: DB;

const baseLink: repo.LinkInput = {
  url: "https://a.feishu.cn/docx/1",
  title: "需求文档",
  projectId: null,
  note: "",
  accessCode: "",
  expiresAt: null,
  pinned: false,
  favorite: false,
  tags: [],
};

beforeEach(() => {
  db = openDb(":memory:");
});

describe("分组与项目", () => {
  it("新建时自动排在最后", () => {
    const g1 = repo.createGroup(db, "工作");
    const g2 = repo.createGroup(db, "个人");
    expect([g1.sort, g2.sort]).toEqual([0, 1]);
    const p1 = repo.createProject(db, { groupId: g1.id, name: "官网改版" });
    const p2 = repo.createProject(db, { groupId: g1.id, name: "数据平台" });
    expect([p1.sort, p2.sort]).toEqual([0, 1]);
  });

  it("删除项目后链接回到收件箱", () => {
    const g = repo.createGroup(db, "工作");
    const p = repo.createProject(db, { groupId: g.id, name: "官网改版" });
    const l = repo.createLink(db, { ...baseLink, projectId: p.id });
    repo.deleteProject(db, p.id);
    expect(repo.getLink(db, l.id).projectId).toBeNull();
  });

  it("删除分组会删除其中项目，链接回到收件箱", () => {
    const g = repo.createGroup(db, "工作");
    const p = repo.createProject(db, { groupId: g.id, name: "官网改版" });
    const l = repo.createLink(db, { ...baseLink, projectId: p.id });
    repo.deleteGroup(db, g.id);
    const data = repo.getAppData(db);
    expect(data.projects).toHaveLength(0);
    expect(data.links[0].id).toBe(l.id);
    expect(data.links[0].projectId).toBeNull();
  });

  it("把项目拖到另一个分组", () => {
    const g1 = repo.createGroup(db, "工作");
    const g2 = repo.createGroup(db, "个人");
    const a = repo.createProject(db, { groupId: g1.id, name: "A" });
    const b = repo.createProject(db, { groupId: g2.id, name: "B" });
    repo.reorderProjects(db, g2.id, [a.id, b.id]);
    const projects = repo.getAppData(db).projects;
    expect(projects.map((p) => [p.name, p.groupId, p.sort])).toEqual([
      ["A", g2.id, 0],
      ["B", g2.id, 1],
    ]);
  });

  it("链接指向不存在的项目时报错", () => {
    expect(() => repo.createLink(db, { ...baseLink, projectId: 999 })).toThrow("项目不存在");
  });
});

describe("链接", () => {
  it("保存标签，忽略重复和大小写", () => {
    const l = repo.createLink(db, { ...baseLink, tags: ["需求", "#Design", "design", " 需求 "] });
    expect(l.tags).toEqual(["Design", "需求"]);
    expect(repo.getAppData(db).tags.map((t) => t.name)).toEqual(["Design", "需求"]);
  });

  it("只更新传入的字段", () => {
    const l = repo.createLink(db, { ...baseLink, tags: ["需求"], accessCode: "ab12" });
    const u = repo.updateLink(db, l.id, { title: "需求文档 v2" });
    expect(u.title).toBe("需求文档 v2");
    expect(u.accessCode).toBe("ab12");
    expect(u.tags).toEqual(["需求"]);
  });

  it("记录访问次数", () => {
    const l = repo.createLink(db, baseLink);
    repo.recordVisit(db, l.id);
    repo.recordVisit(db, l.id);
    const r = repo.getLink(db, l.id);
    expect(r.visitCount).toBe(2);
    expect(r.lastVisitedAt).not.toBeNull();
  });

  it("回收站：删除、恢复、彻底删除", () => {
    const a = repo.createLink(db, baseLink);
    const b = repo.createLink(db, { ...baseLink, url: "https://b.com" });
    repo.batchLinks(db, [a.id, b.id], { action: "delete" });
    expect(repo.getAppData(db).links).toHaveLength(0);
    expect(repo.getTrash(db)).toHaveLength(2);
    repo.batchLinks(db, [a.id], { action: "restore" });
    expect(repo.getAppData(db).links.map((l) => l.id)).toEqual([a.id]);
    repo.batchLinks(db, [a.id, b.id], { action: "purge" });
    expect(repo.getAppData(db).links).toHaveLength(1);
    expect(repo.getTrash(db)).toHaveLength(0);
  });

  it("回收站超过 30 天自动清理", () => {
    const l = repo.createLink(db, baseLink);
    db.prepare("UPDATE links SET deleted_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", l.id);
    expect(repo.getTrash(db)).toHaveLength(0);
  });

  it("批量移动和加标签", () => {
    const g = repo.createGroup(db, "工作");
    const p = repo.createProject(db, { groupId: g.id, name: "官网改版" });
    const a = repo.createLink(db, baseLink);
    const b = repo.createLink(db, { ...baseLink, url: "https://b.com", tags: ["旧"] });
    repo.batchLinks(db, [a.id, b.id], { action: "move", projectId: p.id });
    repo.batchLinks(db, [a.id, b.id], { action: "addTags", tags: ["合同"] });
    repo.batchLinks(db, [b.id], { action: "removeTag", tag: "旧" });
    const links = repo.getAppData(db).links;
    expect(links.every((l) => l.projectId === p.id)).toBe(true);
    expect(links.map((l) => l.tags)).toEqual([["合同"], ["合同"]]);
  });
});

describe("标签", () => {
  it("重命名为已有标签时合并", () => {
    const l1 = repo.createLink(db, { ...baseLink, tags: ["设计"] });
    const l2 = repo.createLink(db, { ...baseLink, url: "https://b.com", tags: ["设计稿", "设计"] });
    const tags = repo.getAppData(db).tags;
    const id = tags.find((t) => t.name === "设计稿")!.id;
    repo.renameTag(db, id, "设计");
    expect(repo.getAppData(db).tags.map((t) => t.name)).toEqual(["设计"]);
    expect(repo.getLink(db, l1.id).tags).toEqual(["设计"]);
    expect(repo.getLink(db, l2.id).tags).toEqual(["设计"]);
  });
});

describe("导入导出", () => {
  it("导入时跳过已存在的链接", () => {
    repo.createLink(db, baseLink);
    const r = repo.importLinks(
      db,
      [
        { url: "https://a.feishu.cn/docx/1/?from=from_copylink", title: "重复" },
        { url: "https://docs.qq.com/sheet/x", title: "排期表", accessCode: "ab12" },
        { url: "https://docs.qq.com/sheet/x", title: "排期表又一次" },
      ],
      { projectId: null, tags: ["导入"] },
    );
    expect(r).toEqual({ imported: 1, skipped: 2 });
    const added = repo.getAppData(db).links.find((l) => l.title === "排期表")!;
    expect(added.accessCode).toBe("ab12");
    expect(added.tags).toEqual(["导入"]);
  });

  it("备份后恢复到新库，结构一致", () => {
    const g = repo.createGroup(db, "工作");
    const p = repo.createProject(db, { groupId: g.id, name: "官网改版", description: "Q4" });
    repo.createLink(db, { ...baseLink, projectId: p.id, tags: ["需求"], accessCode: "x1y2", favorite: true });
    repo.createLink(db, { ...baseLink, url: "https://inbox.com", title: "未分类" });
    const backup = repo.exportBackup(db);

    const db2 = openDb(":memory:");
    expect(repo.importBackup(db2, backup)).toEqual({ imported: 2, skipped: 0, reminders: 0 });
    const data = repo.getAppData(db2);
    expect(data.groups.map((x) => x.name)).toEqual(["工作"]);
    expect(data.projects.map((x) => [x.name, x.description])).toEqual([["官网改版", "Q4"]]);
    const link = data.links.find((l) => l.title === "需求文档")!;
    expect(link.projectId).toBe(data.projects[0].id);
    expect(link.tags).toEqual(["需求"]);
    expect(link.accessCode).toBe("x1y2");
    expect(link.favorite).toBe(true);
    expect(data.links.find((l) => l.title === "未分类")!.projectId).toBeNull();

    // 再恢复一次不会重复
    expect(repo.importBackup(db2, backup)).toEqual({ imported: 0, skipped: 2, reminders: 0 });
    expect(repo.getAppData(db2).groups).toHaveLength(1);
  });
});
