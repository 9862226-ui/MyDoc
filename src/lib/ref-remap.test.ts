import { describe, expect, it } from "vitest";
import { applyPlanOp, getDayPlan } from "./dayplan-repo";
import { openDb, type DB } from "./db";
import { restoreJson } from "./full-backup";
import { createMeeting } from "./meeting-repo";
import { parseRefs, refToken } from "./refs";
import * as repo from "./repo";
import { createSnippet } from "./snippet-repo";
import * as wr from "./worklog-repo";

const log = (db: DB, date: string, content: string, detail = "") =>
  wr.createWorkLogs(db, [{ date, period: "am", projectId: null, content, detail, hours: null, done: true }])[0];
const snippet = (db: DB, content: string) =>
  createSnippet(db, { content, projectId: null, tags: [], sourceUrl: "", sourceTitle: "", pinned: false });
const textOf = (db: DB, sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { t: string }).t;
/** 引用指到的内容 */
const target = (db: DB, text: string) =>
  parseRefs(text).map((r) => {
    const sql = {
      log: "SELECT content t FROM work_logs WHERE id = ?",
      meeting: "SELECT title t FROM meetings WHERE id = ?",
      snippet: "SELECT content t FROM snippets WHERE id = ?",
      link: "SELECT title t FROM links WHERE id = ?",
    }[r.type];
    return `${r.type}:${(db.prepare(sql).get(r.id) as { t: string } | undefined)?.t ?? "（没有）"}`;
  });
const backupOf = (db: DB) => JSON.parse(JSON.stringify({ ...repo.exportBackup(db), work: wr.exportWork(db) }));

describe("跨服务器恢复时对应内容引用", () => {
  it("恢复到已有数据的库：引用换成新编号，重复的对应到已有的那条，备份里没有的改成文字", () => {
    const db = openDb(":memory:");
    const a = log(db, "2026-10-13", "修复切片问题");
    const gone = log(db, "2026-10-13", "后来删掉的记录");
    const m = createMeeting(db, {
      title: "周会",
      date: "2026-10-14",
      projectId: null,
      attendees: "",
      source: "",
      notes: "",
    });
    const s = snippet(db, "上线检查清单");
    const g = repo.createGroup(db, "工作");
    const p = repo.createProject(db, { groupId: g.id, name: "官网", description: "" });
    const link = repo.createLink(db, {
      projectId: p.id,
      title: "接口文档",
      url: "https://example.com/api",
      note: "",
      accessCode: "",
      expiresAt: null,
      pinned: false,
      favorite: false,
      tags: [],
    });
    const b = log(
      db,
      "2026-10-14",
      "继续修复切片问题",
      `接着 ${refToken("log", a.id, a.content)}，会上定的 ${refToken("meeting", m.id, "周会")}，` +
        `清单 ${refToken("snippet", s.id, "清单")}，文档 ${refToken("link", link.id, "接口文档")}，` +
        `还有 ${refToken("log", gone.id, "后来删掉的记录")}`,
    );
    wr.deleteWorkLog(db, gone.id);
    db.prepare("UPDATE meetings SET notes = ? WHERE id = ?").run(`见 ${refToken("log", b.id, b.content)}`, m.id);
    const [plan] = applyPlanOp(db, "2026-10-14", {
      op: "add",
      items: [{ text: "继续修复切片问题", projectId: null, source: "manual" }],
    }).items;
    applyPlanOp(db, "2026-10-14", { op: "check", id: plan.id, period: "am" });
    const backup = backupOf(db);

    // 另一台服务器：已经有别的内容，编号都错开了；其中「修复切片问题」已经有了
    const db2 = openDb(":memory:");
    for (let i = 0; i < 5; i++) log(db2, "2026-09-01", `旧记录 ${i}`);
    const existingA = log(db2, "2026-10-13", "修复切片问题");
    createMeeting(db2, { title: "别的会", date: "2026-09-01", projectId: null, attendees: "", source: "", notes: "" });
    snippet(db2, "别的摘录");
    snippet(db2, "另一个摘录");

    restoreJson(db2, backup);
    const detail = textOf(db2, "SELECT detail t FROM work_logs WHERE content = ?", "继续修复切片问题");
    expect(target(db2, detail)).toEqual(["log:修复切片问题", "meeting:周会", "snippet:上线检查清单", "link:接口文档"]);
    expect(parseRefs(detail)[0].id).toBe(existingA.id);
    // 删掉的那条改成纯文字，不会指到别的内容
    expect(detail).toContain("还有 后来删掉的记录");
    const notes = textOf(db2, "SELECT notes t FROM meetings WHERE title = ?", "周会");
    expect(target(db2, notes)).toEqual(["log:继续修复切片问题"]);
    // 计划打勾关联的记录也换成了新编号
    const restored = getDayPlan(db2, "2026-10-14").items[0];
    const linked = textOf(db2, "SELECT content t FROM work_logs WHERE id = ?", restored.logId);
    expect(linked).toBe("继续修复切片问题");
  });

  it("旧版本的备份（没有编号）不改动内容", () => {
    const db = openDb(":memory:");
    const a = log(db, "2026-10-13", "a");
    log(db, "2026-10-14", "b", `接着 ${refToken("log", a.id, "a")}`);
    const backup = backupOf(db);
    for (const l of backup.work.logs) delete l.id;
    const db2 = openDb(":memory:");
    restoreJson(db2, backup);
    expect(textOf(db2, "SELECT detail t FROM work_logs WHERE content = 'b'")).toBe(
      `接着 ${refToken("log", a.id, "a")}`,
    );
  });
});
