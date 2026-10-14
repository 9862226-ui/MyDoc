import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { renderMarkdown } from "./markdown";
import { plainText } from "./md-edit";
import { createMeeting } from "./meeting-repo";
import { parseRefs, refToken } from "./refs";
import { backlinks, resolveRef, searchRefTargets } from "./refs-repo";
import * as wr from "./worklog-repo";

describe("引用的格式", () => {
  it("解析引用，同一个只算一次", () => {
    expect(parseRefs("接着 [[log:12|修复切片]]，见 [[meeting:3]] 和 [[log:12|又一次]] [[foo:1|x]]")).toEqual([
      { type: "log", id: 12, label: "修复切片" },
      { type: "meeting", id: 3, label: "" },
    ]);
  });

  it("插入的引用去掉会破坏格式的字符，太长的截断", () => {
    expect(refToken("log", 5, "a]b|c\nd")).toBe("[[log:5|a b c d]]");
    expect(refToken("snippet", 1, "长".repeat(50))).toBe(`[[snippet:1|${"长".repeat(40)}…]]`);
  });

  it("显示成可以点的引用，标题会转义；链接类型在新标签页打开", () => {
    const html = renderMarkdown("接着 [[log:12|<b>修复</b>]] 和 [[link:7|文档]]");
    expect(html).toContain('<a class="md-ref md-ref-log" href="/go/log/12" data-ref="log:12" title="工作记录">');
    expect(html).toContain("&lt;b&gt;修复&lt;/b&gt;</a>");
    expect(html).toContain('href="/go/link/7" data-ref="link:7" title="链接" target="_blank"');
    // 代码里的不算
    expect(renderMarkdown("`[[log:1|x]]`")).not.toContain("md-ref");
  });

  it("纯文本摘要里只留标题", () => {
    expect(plainText("接着 [[log:12|修复切片]] 和 [[meeting:3]]")).toBe("接着 修复切片 和 会议纪要");
  });
});

describe("引用的数据", () => {
  const setup = () => {
    const db = openDb(":memory:");
    const [a, b] = wr.createWorkLogs(db, [
      { date: "2026-10-13", period: "am", projectId: null, content: "修复切片问题", hours: null, done: false },
      { date: "2026-10-14", period: "am", projectId: null, content: "写接口文档", hours: null, done: true },
    ]);
    const [c] = wr.createWorkLogs(db, [
      {
        date: "2026-10-15",
        period: "pm",
        projectId: null,
        content: "继续修复切片问题",
        detail: `接着 ${refToken("log", a.id, a.content)}`,
        hours: null,
        done: true,
      },
    ]);
    const m = createMeeting(db, {
      title: "周会",
      date: "2026-10-16",
      projectId: null,
      attendees: "",
      source: "",
      notes: `- 切片问题见 ${refToken("log", a.id, a.content)}\n- 自己引用自己 [[meeting:999]]`,
    });
    return { db, a, b, c, m };
  };

  it("反向链接：被引用的内容 → 引用了它的内容，新的在前", () => {
    const { db, a, c, m } = setup();
    const links = backlinks(db);
    expect(links[`log:${a.id}`].map((s) => [s.type, s.id, s.title])).toEqual([
      ["meeting", m.id, "周会"],
      ["log", c.id, "继续修复切片问题"],
    ]);
    expect(links["meeting:999"]).toHaveLength(1);
  });

  it("搜索可以引用的内容：没关键字时是最近的记录和会议；支持拼音", () => {
    const { db, a } = setup();
    expect(searchRefTargets(db, "").map((t) => t.type)).toEqual(["log", "log", "log", "meeting"]);
    const hits = searchRefTargets(db, "qp");
    expect(hits.map((t) => t.title)).toEqual(["继续修复切片问题", "修复切片问题"]);
    expect(hits[1]).toMatchObject({ type: "log", id: a.id, subtitle: "工作记录 · 10月13日" });
  });

  it("跳转地址：工作记录到那一天，删掉的返回 null", () => {
    const { db, a, m } = setup();
    expect(resolveRef(db, "log", a.id)).toBe(`/work?date=2026-10-13&log=${a.id}`);
    expect(resolveRef(db, "meeting", m.id)).toBe(`/meetings?id=${m.id}`);
    expect(resolveRef(db, "log", 9999)).toBeNull();
    expect(resolveRef(db, "link", 1)).toBeNull();
  });
});

describe("删掉的内容不会被新内容顶替 id", () => {
  it("删掉最后一条工作记录、会议、摘录后，新建的用新 id", () => {
    const db = openDb(":memory:");
    const [a] = wr.createWorkLogs(db, [
      { date: "2026-10-13", period: "am", projectId: null, content: "a", hours: null, done: true },
    ]);
    wr.deleteWorkLog(db, a.id);
    const [b] = wr.createWorkLogs(db, [
      { date: "2026-10-13", period: "am", projectId: null, content: "b", hours: null, done: true },
    ]);
    expect(b.id).toBeGreaterThan(a.id);
    const m = createMeeting(db, {
      title: "x",
      date: "2026-10-13",
      projectId: null,
      attendees: "",
      source: "",
      notes: "",
    });
    db.prepare("DELETE FROM meetings WHERE id = ?").run(m.id);
    const m2 = createMeeting(db, {
      title: "y",
      date: "2026-10-13",
      projectId: null,
      attendees: "",
      source: "",
      notes: "",
    });
    expect(m2.id).toBeGreaterThan(m.id);
  });
});
