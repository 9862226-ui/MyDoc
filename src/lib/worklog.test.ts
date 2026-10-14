import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db";
import {
  buildDaily,
  buildWeekly,
  isoWeek,
  numbered,
  numberedInline,
  splitEntries,
  weekdayLabel,
  weekStart,
  type WorkData,
  type WorkLog,
} from "./worklog";
import { buildDailyPrompt } from "./worklog-ai";
import * as wr from "./worklog-repo";

let seq = 0;
const log = (patch: Partial<WorkLog>): WorkLog => ({
  id: ++seq,
  date: "2026-10-10",
  period: "am",
  projectId: 1,
  content: "整理测试文档",
  hours: null,
  done: true,
  source: "web",
  createdAt: `2026-10-10T0${seq % 10}:00:00Z`,
  updatedAt: "",
  ...patch,
});

const data = (logs: WorkLog[], reports: WorkData["reports"] = {}): WorkData => ({
  projects: [
    {
      id: 1,
      name: "智能造价系统",
      code: "10260510065",
      taskName: "临时任务",
      taskCode: "LSRW_001",
      archived: false,
      sort: 1,
    },
    { id: 2, name: "数据平台", code: "", taskName: "", taskCode: "", archived: false, sort: 2 },
  ],
  logs,
  settings: { dailyHours: 8 },
  reports,
});

describe("日期", () => {
  it("周一开始算一周，周次和公司系统一致", () => {
    expect(weekStart("2026-10-10")).toBe("2026-10-05");
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
    expect(isoWeek("2026-10-08")).toBe(41);
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(weekdayLabel("2026-10-08")).toBe("周四");
  });
});

describe("文本", () => {
  it("编号并去掉重复和句尾标点", () => {
    expect(numbered(["修复删除问题。", "加引用来源", "修复删除问题"])).toBe("1. 修复删除问题\n2. 加引用来源");
    expect(numberedInline(["只有一条"])).toBe("只有一条");
    expect(numberedInline(["a", "b"])).toBe("1. a 2. b");
  });
  it("粘贴多行时拆开并去掉原来的编号", () => {
    expect(splitEntries("1. 整理文档\n2、修复问题\n\n- 写周报\n直接一行")).toEqual([
      "整理文档",
      "修复问题",
      "写周报",
      "直接一行",
    ]);
  });
});

describe("日报", () => {
  it("按项目汇总，工时平均分到正常工时，上午下午分开总结", () => {
    const r = buildDaily(
      data([
        log({ content: "整理知识库测试文档" }),
        log({ content: "修复切片未清理的问题", period: "pm" }),
        log({ content: "数据平台开会", projectId: 2, period: "pm", done: false }),
      ]),
      "2026-10-10",
    );
    expect(r.hours).toBe(8);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      projectName: "智能造价系统",
      taskCode: "LSRW_001",
      status: "已完成",
      progress: 100,
      content: "1. 整理知识库测试文档 2. 修复切片未清理的问题",
    });
    expect(r.rows[0].hours + r.rows[1].hours).toBe(8);
    expect(r.rows[1].status).toBe("进行中");
    expect(r.amSummary).toBe("1. 整理知识库测试文档");
    expect(r.pmSummary).toBe("1. 修复切片未清理的问题\n2. 数据平台开会");
    expect(r.amProject).toBe("智能造价系统");
  });

  it("填了工时的按填的算；只记了半天时两栏都用全天内容", () => {
    const r = buildDaily(
      data([log({ hours: 3 }), log({ content: "写接口", hours: null, projectId: 2 })]),
      "2026-10-10",
    );
    expect(r.rows.map((x) => x.hours)).toEqual([3, 5]);
    expect(r.amSummary).toBe(r.pmSummary);
  });

  it("手动改过的总结优先", () => {
    const r = buildDaily(data([log({})], { "daily:2026-10-10": { amSummary: "改过的" } }), "2026-10-10");
    expect(r.amSummary).toBe("改过的");
    expect(r.autoAmSummary).toBe("1. 整理测试文档");
  });
});

describe("周报", () => {
  it("每天一行，没做完的放进下周计划", () => {
    const r = buildWeekly(
      data([
        log({ date: "2026-10-08", content: "代码升级测试" }),
        log({ date: "2026-10-09", content: "代码升级测试" }),
        log({ date: "2026-10-10", content: "分段导入支持 Word", done: false }),
        log({ date: "2026-10-12", content: "下周的不算" }),
      ]),
      "2026-10-10",
    );
    expect(r).toMatchObject({ week: 41, start: "2026-10-05", end: "2026-10-11", workDays: 3, hours: 24 });
    expect(r.days.map((d) => d.weekday)).toEqual(["周四", "周五", "周六"]);
    expect(r.days[0]).toMatchObject({ projectName: "智能造价系统", projectCode: "10260510065" });
    expect(r.summary).toBe("1. 代码升级测试\n2. 分段导入支持 Word");
    expect(r.plan).toBe("1. 继续分段导入支持 Word");
  });
});

describe("数据库", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("增删改查，删除项目后记录保留", () => {
    const p = wr.createWorkProject(db, {
      name: "智能造价系统",
      code: "1026",
      taskName: "",
      taskCode: "",
      archived: false,
    });
    const [a, b] = wr.createWorkLogs(db, [
      { date: "2026-10-10", period: "am", projectId: p.id, content: "一", hours: null, done: true },
      { date: "2026-10-12", period: "pm", projectId: null, content: "二", hours: 2, done: false },
    ]);
    expect(wr.getWorkWeek(db, "2026-10-08").logs.map((l) => l.id)).toEqual([a.id]);
    expect(wr.updateWorkLog(db, b.id, { done: true }).done).toBe(true);
    expect(wr.findWorkProject(db, "造价")?.id).toBe(p.id);
    wr.deleteWorkProject(db, p.id);
    expect(wr.getWorkWeek(db, "2026-10-10").logs[0].projectId).toBeNull();
    expect(() => wr.createWorkLogs(db, [{ ...a, projectId: 999 }])).toThrow("项目不存在");
  });

  it("报告字段合并保存，null 恢复自动生成", () => {
    wr.setReportFields(db, "daily", "2026-10-10", { amSummary: "上午", pmSummary: "下午" });
    wr.setReportFields(db, "daily", "2026-10-10", { amSummary: null });
    expect(wr.getReportFields(db, "daily", "2026-10-10")).toEqual({ pmSummary: "下午" });
    expect(wr.getWorkWeek(db, "2026-10-10").reports["daily:2026-10-10"]).toEqual({ pmSummary: "下午" });
  });
});

describe("AI 提示词", () => {
  it("带上项目名和未完成标记", () => {
    const m = buildDailyPrompt(data([log({ done: false })]), "2026-10-10");
    expect(m[1].content).toContain("[智能造价系统] 整理测试文档（未完成）");
    expect(m[1].content).toContain("下午：\n（没有记录）");
  });
});
