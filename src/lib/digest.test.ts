import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { DEFAULT_NOTIFY, setNotifyConfig } from "./notify";
import { DEFAULT_WORK_SETTINGS } from "./worklog";
import { digestMessage, firstWorkday, runWorkRemind } from "./worklog-remind";
import * as wr from "./worklog-repo";

const MON = "2026-10-19";
const LAST = "2026-10-12";

/** 东八区的某天某时 */
const at = (hhmm: string, date: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)), h - 8, m));
};

const setup = () => {
  const db = openDb(":memory:");
  const p = wr.createWorkProject(db, { name: "知识库", code: "", taskName: "", taskCode: "", archived: false });
  wr.createWorkLogs(db, [
    { date: LAST, period: "am", projectId: p.id, content: "写接口", hours: null, done: true },
    { date: "2026-10-13", period: "pm", projectId: p.id, content: "修复切片问题", hours: null, done: false },
  ]);
  wr.setReportFields(db, "daily", LAST, { submittedAt: "2026-10-12T10:00:00Z" });
  wr.setProjectUpdate(db, { projectId: p.id, week: LAST, health: "at_risk", note: "等运维扩容" });
  return { db, p };
};

describe("每周开工提醒", () => {
  it("每周第一个工作日：周一放假顺延到周二，整周放假不发", () => {
    expect(firstWorkday(DEFAULT_WORK_SETTINGS, "2026-10-21")).toBe(MON);
    const s = { ...DEFAULT_WORK_SETTINGS, specialDays: { [MON]: { off: true, name: "放假" } } };
    expect(firstWorkday(s, MON)).toBe("2026-10-20");
    const all = Object.fromEntries(
      ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((d) => [
        d,
        { off: true, name: "国庆" },
      ]),
    );
    expect(firstWorkday({ ...DEFAULT_WORK_SETTINGS, specialDays: all }, MON)).toBeNull();
  });

  it("消息里有上周回顾、没交的日报周报、本周计划、有风险的项目、今天的计划", () => {
    const { db } = setup();
    const m = digestMessage({
      last: wr.getWorkWeek(db, LAST),
      date: MON,
      today: { items: [{ id: "a", text: "压测", projectId: null, source: "carry", status: "todo" }], candidates: [] },
      siteUrl: "https://doc.example.test/",
      withReport: true,
    });
    expect(m.title).toBe("MyDoc：新的一周开始了（第 43 周）");
    expect(m.text).toContain("上周第 42 周（10月12日 ~ 10月18日）工作 2 天，记了 2 条，还有 1 件没做完。");
    expect(m.text).toContain("上周周报还没提交，还有 1 天日报没提交。");
    expect(m.text).toContain("【本周计划】\n1. 继续修复切片问题");
    expect(m.text).toContain("【需要关注的项目】\n1. 知识库【有风险】等运维扩容");
    expect(m.text).toContain("今天的计划里已有 1 件。");
    expect(m.markdown).toContain("[开工：安排今天的计划](https://doc.example.test/work?do=plan)");

    // 不带完整内容时只说件数
    const short = digestMessage({
      last: wr.getWorkWeek(db, LAST),
      date: MON,
      today: { items: [], candidates: [] },
      siteUrl: "",
      withReport: false,
    });
    expect(short.text).toContain("本周计划 1 件。");
    expect(short.text).not.toContain("【上周完成】");
  });

  it("上周没有记录也能发", () => {
    const db = openDb(":memory:");
    const m = digestMessage({
      last: wr.getWorkWeek(db, LAST),
      date: MON,
      today: { items: [], candidates: [] },
      siteUrl: "",
      withReport: true,
    });
    expect(m.text).toBe("上周第 42 周（10月12日 ~ 10月18日）没有工作记录。");
  });

  it("打开后到点发一次；不是第一个工作日不发", async () => {
    const { db } = setup();
    setNotifyConfig(db, { ...DEFAULT_NOTIFY, target: "https://example.test/hook" });
    wr.setWorkSettings(db, { ...DEFAULT_WORK_SETTINGS, remindDigest: true, digestTime: "08:50" });
    const sent: { title: string }[] = [];
    const send = async (_c: unknown, m: { title: string }) => {
      sent.push(m);
    };
    expect(await runWorkRemind(db, at("08:49", MON), send)).toEqual([]);
    expect(await runWorkRemind(db, at("08:51", MON), send)).toEqual(["digest:sent"]);
    expect(await runWorkRemind(db, at("09:10", MON), send)).toEqual([]);
    expect(await runWorkRemind(db, at("08:55", "2026-10-20"), send)).toEqual([]);
    expect(sent.map((x) => x.title)).toEqual(["MyDoc：新的一周开始了（第 43 周）"]);
    expect(wr.getRemindState(db).last?.message).toBe("已推送每周开工提醒");
  });
});
