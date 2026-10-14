import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import * as repo from "./repo";
import { backupSchema } from "./schemas";
import { projectStatus, projectStatusText, suggestNote, weeklyText, buildWeekly } from "./worklog";
import { remindMessage } from "./worklog-remind";
import * as wr from "./worklog-repo";

const WEEK = "2026-10-12";
const project = (db: ReturnType<typeof openDb>, name: string, archived = false) =>
  wr.createWorkProject(db, { name, code: "", taskName: "", taskCode: "", archived });

describe("项目进展", () => {
  it("每个项目每周一条，写在周中任意一天都算那一周；可以清除", () => {
    const db = openDb(":memory:");
    const p = project(db, "知识库");
    wr.setProjectUpdate(db, { projectId: p.id, week: "2026-10-14", health: "at_risk", note: " 等运维排期 " });
    const u = wr.setProjectUpdate(db, { projectId: p.id, week: WEEK, health: "on_track", note: "已排期" });
    expect(wr.listProjectUpdates(db).map((x) => [x.week, x.health, x.note])).toEqual([[WEEK, "on_track", "已排期"]]);
    expect(u.week).toBe(WEEK);
    wr.deleteProjectUpdate(db, p.id, "2026-10-16");
    expect(wr.listProjectUpdates(db)).toEqual([]);
    expect(() => wr.setProjectUpdate(db, { projectId: 999, week: WEEK, health: "on_track", note: "" })).toThrow();
  });

  it("要写进展的项目：这周有记录的、有风险还没恢复的；停用的和上次正常又没记录的不出现", () => {
    const db = openDb(":memory:");
    const a = project(db, "知识库");
    const b = project(db, "造价系统");
    const c = project(db, "官网");
    project(db, "旧项目", true);
    wr.createWorkLogs(db, [
      { date: "2026-10-13", period: "am", projectId: a.id, content: "修复切片", hours: null, done: true },
      { date: "2026-10-14", period: "am", projectId: a.id, content: "修复切片", hours: null, done: true },
      { date: "2026-10-14", period: "pm", projectId: a.id, content: "写接口", hours: null, done: true },
    ]);
    wr.setProjectUpdate(db, { projectId: b.id, week: "2026-10-05", health: "off_track", note: "服务器没到" });
    wr.setProjectUpdate(db, { projectId: c.id, week: "2026-10-05", health: "on_track", note: "上线了" });
    const rows = projectStatus(wr.getWorkWeek(db, WEEK), WEEK);
    expect(rows.map((r) => [r.project.name, r.items, r.missing, r.last?.health ?? null])).toEqual([
      ["知识库", ["修复切片", "写接口"], true, null],
      ["造价系统", [], false, "off_track"],
    ]);
    expect(suggestNote(rows[0].items)).toBe("本周修复切片；写接口");
  });

  it("复制的文字：项目名【状态】进展，多行合成一行；整张周报里带上", () => {
    const db = openDb(":memory:");
    const a = project(db, "知识库");
    wr.createWorkLogs(db, [{ date: WEEK, period: "am", projectId: a.id, content: "写接口", hours: null, done: true }]);
    wr.setProjectUpdate(db, { projectId: a.id, week: WEEK, health: "at_risk", note: "接口联调完成\n等运维扩容" });
    const data = wr.getWorkWeek(db, WEEK);
    const text = projectStatusText(projectStatus(data, WEEK));
    expect(text).toBe("1. 知识库【有风险】接口联调完成；等运维扩容");
    expect(weeklyText(buildWeekly(data, WEEK), text)).toContain("项目进展：\n1. 知识库【有风险】");
    expect(weeklyText(buildWeekly(data, WEEK))).not.toContain("项目进展");
  });

  it("周报提醒说一下没写进展的项目；完整内容里带上项目进展", () => {
    const db = openDb(":memory:");
    const a = project(db, "知识库");
    const b = project(db, "造价系统");
    wr.createWorkLogs(db, [
      { date: WEEK, period: "am", projectId: a.id, content: "写接口", hours: null, done: true },
      { date: WEEK, period: "pm", projectId: b.id, content: "评审", hours: null, done: true },
    ]);
    wr.setProjectUpdate(db, { projectId: a.id, week: WEEK, health: "on_track", note: "联调完成" });
    const msg = remindMessage("weekly", wr.getWorkWeek(db, "2026-10-16"), "2026-10-16", "", true);
    expect(msg.text).toContain("1 个项目没写进展");
    expect(msg.text).toContain("【项目进展】\n1. 知识库【正常】联调完成");
  });

  it("跟着 JSON 备份导出、恢复；恢复时不覆盖已经写过的", () => {
    const db = openDb(":memory:");
    const a = project(db, "知识库");
    wr.setProjectUpdate(db, { projectId: a.id, week: WEEK, health: "at_risk", note: "等扩容" });
    const backup = backupSchema.parse(
      JSON.parse(JSON.stringify({ ...repo.exportBackup(db), work: wr.exportWork(db) })),
    );
    const db2 = openDb(":memory:");
    const b = project(db2, "知识库");
    wr.setProjectUpdate(db2, { projectId: b.id, week: WEEK, health: "on_track", note: "已解决" });
    wr.importWork(db2, { ...backup.work!, settings: wr.getWorkSettings(db2) });
    expect(wr.listProjectUpdates(db2).map((u) => u.note)).toEqual(["已解决"]);
    const db3 = openDb(":memory:");
    wr.importWork(db3, { ...backup.work!, settings: wr.getWorkSettings(db3) });
    expect(wr.listProjectUpdates(db3).map((u) => [u.health, u.note])).toEqual([["at_risk", "等扩容"]]);
  });
});
