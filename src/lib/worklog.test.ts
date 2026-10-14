import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db";
import {
  buildDaily,
  buildWeekly,
  dayStats,
  dayStatus,
  DEFAULT_WORK_SETTINGS,
  listDays,
  weekStatus,
  filterLogs,
  isMissed,
  isoWeek,
  isWorkday,
  logsCsv,
  monthGrid,
  projectTotals,
  shiftMonth,
  weeksWithLogs,
  numbered,
  numberedInline,
  splitEntries,
  weekdayLabel,
  weekStart,
  draftOf,
  draftOps,
  logKey,
  type WeeklyDraft,
  type WorkData,
  type WorkLog,
} from "./worklog";
import { fetchHolidays, parseHolidayCn } from "./holidays";
import { DEFAULT_NOTIFY, setNotifyConfig } from "./notify";
import * as repo from "./repo";
import { backupSchema } from "./schemas";
import { buildDailyPrompt } from "./worklog-ai";
import { isDue, runWorkRemind } from "./worklog-remind";
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
  settings: { ...DEFAULT_WORK_SETTINGS },
  reports,
  remind: { pushReady: false },
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
    expect(r.summaryText).toBe("1. 代码升级测试\n2. 分段导入支持 Word");
    expect(r.candidates[0]).toMatchObject({ text: "代码升级测试", days: 2, done: true });
    expect(r.planText).toBe("1. 继续分段导入支持 Word");
    expect(r.curated).toBe(false);
  });

  const weekLogs = () => [
    log({ date: "2026-10-05", content: "升级代码" }),
    log({ date: "2026-10-06", content: "测试并修正问题" }),
    log({ date: "2026-10-07", content: "开会", projectId: 2 }),
    log({ date: "2026-10-08", content: "改名报错", done: false }),
  ];
  const withDraft = (logs: WorkLog[], draft: WeeklyDraft, start = "2026-10-05") =>
    data(logs, { [`weekly:${start}`]: { draft } });

  it("人工整理：取消勾选、合并、拆开、调顺序、手动添加", () => {
    const logs = weekLogs();
    let r = buildWeekly(data(logs), "2026-10-05");
    let d = draftOf(r);
    d = draftOps.toggle(d, r.candidates.find((c) => c.text === "开会")!, false);
    r = buildWeekly(withDraft(logs, d), "2026-10-05");
    expect(r.items.map((i) => i.text)).toEqual(["升级代码", "测试并修正问题", "改名报错"]);
    expect(r.candidateState[logKey("开会")]).toBe("unchecked");

    d = draftOps.merge(d, [r.items[0].id, r.items[1].id], "完成代码升级与测试");
    d = draftOps.add(d, "参加技术分享");
    r = buildWeekly(withDraft(logs, d), "2026-10-05");
    expect(r.summaryText).toBe("1. 完成代码升级与测试\n2. 改名报错\n3. 参加技术分享");
    expect(r.items[0].from).toHaveLength(2);

    d = draftOps.move(d, r.items[2].id, -2);
    expect(d.items[0].text).toBe("参加技术分享");
    d = draftOps.split(d, r.items[0].id, (k) => r.candidates.find((c) => c.key === k)!.text);
    r = buildWeekly(withDraft(logs, d), "2026-10-05");
    expect(r.items.map((i) => i.text)).toEqual(["参加技术分享", "升级代码", "测试并修正问题", "改名报错"]);
  });

  it("整理后新加的记录标成「新增」，删掉的记录从总结里去掉", () => {
    const logs = weekLogs();
    const d = draftOf(buildWeekly(data(logs), "2026-10-05"));
    const more = [...logs, log({ date: "2026-10-09", content: "写周报" })];
    const r = buildWeekly(withDraft(more, d), "2026-10-05");
    expect(r.candidateState[logKey("写周报")]).toBe("new");
    expect(r.items).toHaveLength(4);
    const fewer = buildWeekly(withDraft(logs.slice(1), d), "2026-10-05");
    expect(fewer.items.map((i) => i.text)).not.toContain("升级代码");
    // 合并过的条目是自己写的字，来源没了也保留
    const merged = draftOps.merge(d, [d.items[0].id, d.items[1].id], "完成升级与测试");
    const kept = buildWeekly(withDraft(logs.slice(2), merged), "2026-10-05");
    expect(kept.items.map((i) => i.text)).toContain("完成升级与测试");
  });

  it("上周计划逐条打勾：打勾的写进本周总结，没做完的建议放进下周计划", () => {
    const lastWeek = {
      items: [],
      excluded: [],
      doneLastPlan: [],
      plan: [
        { id: "a", text: "继续改名报错" },
        { id: "b", text: "整理上线文档" },
      ],
    };
    const logs = [log({ date: "2026-10-12", content: "写接口" })];
    const reports = { "weekly:2026-10-05": { draft: lastWeek } };
    let r = buildWeekly(data(logs, reports), "2026-10-12");
    expect(r.lastPlan.map((p) => p.text)).toEqual(["继续改名报错", "整理上线文档"]);
    let d = draftOps.doneLast(draftOf(r), r.lastPlan[0], true);
    r = buildWeekly(data(logs, { ...reports, "weekly:2026-10-12": { draft: d } }), "2026-10-12");
    expect(r.summaryText).toBe("1. 改名报错\n2. 写接口");
    expect(r.planSuggestions.map((p) => p.text)).toEqual(["整理上线文档"]);
    d = draftOps.planAdd(d, r.planSuggestions[0].text, r.planSuggestions[0].from);
    d = draftOps.doneLast(d, r.lastPlan[0], false);
    r = buildWeekly(data(logs, { ...reports, "weekly:2026-10-12": { draft: d } }), "2026-10-12");
    expect(r.summaryText).toBe("1. 写接口");
    expect(r.planText).toBe("1. 整理上线文档");
    expect(r.planSuggestions.map((p) => p.text)).toEqual(["继续改名报错"]);
  });

  it("上一周没整理过时，上周计划就是那周没做完的事", () => {
    const r = buildWeekly(data([log({ date: "2026-10-08", content: "改名报错", done: false })]), "2026-10-12");
    expect(r.lastPlan.map((p) => p.text)).toEqual(["继续改名报错"]);
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

describe("下班提醒", () => {
  let db: DB;
  const sent: { title: string; text: string; markdown: string }[] = [];
  const send = async (_c: unknown, m: { title: string; text: string; markdown: string }) => {
    sent.push(m);
  };
  // 2026-10-16 是周五；Asia/Shanghai 17:35 = UTC 09:35
  const at = (hhmm: string, date = "2026-10-16") => {
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)), h - 8, m));
  };

  beforeEach(() => {
    db = openDb(":memory:");
    sent.length = 0;
    setNotifyConfig(db, {
      ...DEFAULT_NOTIFY,
      enabled: false,
      target: "https://example.test/hook",
      siteUrl: "https://doc.example.test/",
    });
    wr.setWorkSettings(db, { ...DEFAULT_WORK_SETTINGS, remindDaily: true, remindWeekly: true });
  });

  it("到点才发，一天只发一次，晚太久不补发", async () => {
    // 周报 16:00 已经到了，日报 17:30 还没到
    expect(await runWorkRemind(db, at("17:29"), send)).toEqual(["weekly:sent"]);
    expect(await runWorkRemind(db, at("17:31"), send)).toEqual(["daily:sent"]);
    expect(await runWorkRemind(db, at("17:45"), send)).toEqual([]);
    expect(sent.map((m) => m.title)).toEqual(["MyDoc：该交周报了（第 42 周）", "MyDoc：该写日报了"]);
    expect(sent[1].text).toContain("今天还没有记录工作");
    expect(sent[1].text).toContain("https://doc.example.test/work");
    // 第二天 21:00 已经晚了 3 个多小时，不补发；周六不在提醒日里
    expect(await runWorkRemind(db, at("21:00", "2026-10-15"), send)).toEqual([]);
    expect(await runWorkRemind(db, at("17:40", "2026-10-17"), send)).toEqual([]);
  });

  it("没配推送方式或关掉提醒时不发", async () => {
    setNotifyConfig(db, { ...DEFAULT_NOTIFY, target: "" });
    expect(await runWorkRemind(db, at("17:31"), send)).toEqual([]);
  });

  it("消息里带上整理好的日报；失败最多重试 3 次", async () => {
    wr.createWorkLogs(db, [
      { date: "2026-10-16", period: "am", projectId: null, content: "整理测试文档", hours: null, done: true },
      { date: "2026-10-16", period: "pm", projectId: null, content: "修复切片问题", hours: null, done: false },
    ]);
    wr.setWorkSettings(db, { ...DEFAULT_WORK_SETTINGS, remindDaily: true });
    const fail = async () => {
      throw new Error("网络不通");
    };
    for (let i = 0; i < 4; i++) await runWorkRemind(db, at(`17:3${i}`), fail);
    expect(wr.getRemindState(db).fails["daily:2026-10-16"]).toBe(3);
    expect(await runWorkRemind(db, at("17:40"), send)).toEqual([]);
    // 第二天恢复
    wr.createWorkLogs(db, [
      { date: "2026-10-19", period: "am", projectId: null, content: "写接口", hours: null, done: true },
    ]);
    expect(await runWorkRemind(db, at("17:31", "2026-10-19"), send)).toEqual(["daily:sent"]);
    expect(sent[0].markdown).toContain("**上午总结**\n1. 写接口");
    expect(sent[0].text).toContain("（下午总结和上午相同）");
  });

  it("提醒时间判断", () => {
    expect(isDue("17:30", new Date(2026, 9, 16, 17, 30))).toBe(true);
    expect(isDue("17:30", new Date(2026, 9, 16, 20, 31))).toBe(false);
  });
});

describe("日历和周报列表", () => {
  it("月历从周一开始补齐整周", () => {
    const g = monthGrid("2026-10");
    expect(g[0]).toBe("2026-09-28");
    expect(g.at(-1)).toBe("2026-11-01");
    expect(g.length % 7).toBe(0);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("统计每天、每个项目，找出漏写的工作日", () => {
    const d = data([
      log({ date: "2026-10-12", content: "a" }),
      log({ date: "2026-10-12", content: "b", projectId: 2, hours: 2 }),
      log({ date: "2026-10-14", content: "c", done: false }),
    ]);
    const stats = dayStats(d);
    expect(stats.get("2026-10-12")).toEqual({ count: 2, hours: 8, undone: 0 });
    expect(stats.get("2026-10-14")?.undone).toBe(1);
    expect(isMissed("2026-10-13", "2026-10-15", stats, d.settings)).toBe(true);
    expect(isMissed("2026-10-11", "2026-10-15", stats, d.settings)).toBe(false); // 周日
    expect(isMissed("2026-10-16", "2026-10-15", stats, d.settings)).toBe(false); // 还没到
    expect(projectTotals(d, "2026-10-12", "2026-10-18")).toEqual([
      { projectId: 1, name: "智能造价系统", hours: 14, count: 2 },
      { projectId: 2, name: "数据平台", hours: 2, count: 1 },
    ]);
    expect(weeksWithLogs([...d.logs, log({ date: "2026-10-01" })])).toEqual(["2026-10-12", "2026-09-28"]);
  });

  it("检索和导出", () => {
    const logs = [
      log({ date: "2026-10-12", content: "修复切片问题" }),
      log({ date: "2026-10-13", content: "写接口, 联调", projectId: 2 }),
    ];
    expect(filterLogs(logs, "切片", "all").map((l) => l.content)).toEqual(["修复切片问题"]);
    expect(filterLogs(logs, "", 2)).toHaveLength(1);
    const csv = logsCsv(logs, data([]).projects);
    expect(csv.split("\r\n")[0]).toBe("日期,周几,时段,项目,工作内容,工时,状态");
    expect(csv).toContain('2026-10-13,周二,上午,数据平台,"写接口, 联调",,已完成');
  });
});

describe("提交状态、日报列表、日报同步到周报", () => {
  it("日报状态：已提交 / 未提交 / 漏记；列表只列到今天", () => {
    const d = data([log({ date: "2026-10-12", content: "a" }), log({ date: "2026-10-13", content: "b" })], {
      "daily:2026-10-12": { submittedAt: "2026-10-12T10:00:00Z" },
    });
    expect(dayStatus(d, "2026-10-12", "2026-10-15")).toBe("submitted");
    expect(dayStatus(d, "2026-10-13", "2026-10-15")).toBe("unsubmitted");
    expect(dayStatus(d, "2026-10-14", "2026-10-15")).toBe("missed");
    expect(dayStatus(d, "2026-10-15", "2026-10-15")).toBeNull(); // 今天还没记，不算漏记
    expect(dayStatus(d, "2026-10-11", "2026-10-15")).toBeNull(); // 周日
    expect(listDays(d, "2026-10", "2026-10-15").slice(0, 3)).toEqual(["2026-10-14", "2026-10-13", "2026-10-12"]);
  });

  it("日报里改过的总结同步到周报的候选和明细", () => {
    const logs = [
      log({ date: "2026-10-12", content: "改代码" }),
      log({ date: "2026-10-12", content: "测试", period: "pm" }),
      log({ date: "2026-10-13", content: "写文档" }),
    ];
    const d = data(logs, {
      "daily:2026-10-12": { amSummary: "1. 完成代码升级并测试", pmSummary: "1. 完成代码升级并测试" },
    });
    expect(buildDaily(d, "2026-10-12").edited).toBe(true);
    const r = buildWeekly(d, "2026-10-12");
    expect(r.candidates.map((c) => c.text)).toEqual(["完成代码升级并测试", "写文档"]);
    expect(r.days[0].content).toBe("完成代码升级并测试");
    expect(r.days[1].content).toBe("写文档");
    expect(weekStatus(r)).toBe("uncurated");
  });
});

describe("下班提醒和提交状态", () => {
  it("今天的日报已提交就不提醒；周报提醒带上没提交的日报天数", async () => {
    const db = openDb(":memory:");
    const sent: { title: string; text: string }[] = [];
    const send = async (_c: unknown, m: { title: string; text: string }) => void sent.push(m);
    setNotifyConfig(db, { ...DEFAULT_NOTIFY, target: "https://example.test/hook" });
    wr.setWorkSettings(db, { ...DEFAULT_WORK_SETTINGS, remindDaily: true, remindWeekly: true });
    wr.createWorkLogs(db, [
      { date: "2026-10-12", period: "am", projectId: null, content: "一", hours: null, done: true },
      { date: "2026-10-16", period: "am", projectId: null, content: "二", hours: null, done: true },
    ]);
    wr.setReportFields(db, "daily", "2026-10-16", { submittedAt: "2026-10-16T09:00:00Z" });
    // 周五 17:31（上海时间）
    const at = new Date(Date.UTC(2026, 9, 16, 9, 31));
    expect(await runWorkRemind(db, at, send)).toEqual(["weekly:sent"]);
    expect(sent[0].text).toContain("本周还有 1 天日报没提交、3 天没有记录");
    wr.setReportFields(db, "weekly", "2026-10-12", { submittedAt: "2026-10-16T09:00:00Z" });
    expect(await runWorkRemind(db, new Date(Date.UTC(2026, 9, 16, 9, 40)), send)).toEqual([]);
  });
});

describe("JSON 备份里的工作记录", () => {
  it("导出后在另一个数据库恢复，再恢复一次不会重复", () => {
    const db = openDb(":memory:");
    const p = wr.createWorkProject(db, { name: "智能造价系统", code: "", taskName: "", taskCode: "", archived: false });
    wr.createWorkLogs(db, [
      { date: "2026-10-12", period: "am", projectId: p.id, content: "写接口", hours: 2, done: true },
      { date: "2026-10-12", period: "pm", projectId: null, content: "开会", hours: null, done: false },
    ]);
    wr.setReportFields(db, "daily", "2026-10-12", { submittedAt: "2026-10-12T10:00:00Z" });
    wr.setWorkSettings(db, { ...DEFAULT_WORK_SETTINGS, dailyHours: 7.5 });
    const backup = backupSchema.parse(JSON.parse(JSON.stringify({ ...repo.exportBackup(db), work: wr.exportWork(db) })));

    const db2 = openDb(":memory:");
    const w = { ...backup.work!, settings: { ...DEFAULT_WORK_SETTINGS, ...backup.work!.settings } };
    expect(wr.importWork(db2, w)).toBe(2);
    expect(wr.importWork(db2, w)).toBe(0);
    const data2 = wr.getWorkWeek(db2, "2026-10-12");
    expect(data2.logs.map((l) => [l.content, data2.projects.find((x) => x.id === l.projectId)?.name ?? null])).toEqual([
      ["写接口", "智能造价系统"],
      ["开会", null],
    ]);
    expect(data2.reports["daily:2026-10-12"].submittedAt).toBe("2026-10-12T10:00:00Z");
    expect(data2.settings.dailyHours).toBe(7.5);
  });

  it("以前没有工作记录的备份也能恢复", () => {
    const db = openDb(":memory:");
    const old = { app: "mydoc", version: 1, exportedAt: "", groups: [] };
    expect(backupSchema.parse(old).work).toBeUndefined();
    expect(repo.importBackup(db, backupSchema.parse(old)).imported).toBe(0);
  });
});

describe("搜索工作记录", () => {
  it("支持拼音首字母和全拼", () => {
    const logs = [log({ content: "修复切片问题", py: "xiu fu qie pian wen ti" }), log({ content: "写接口" })];
    expect(filterLogs(logs, "qp", "all").map((l) => l.content)).toEqual(["修复切片问题"]);
    expect(filterLogs(logs, "qiepian", "all")).toHaveLength(1);
    expect(filterLogs(logs, "接口", "all")).toHaveLength(1);
  });

  it("全部记录的接口带上拼音（包括项目名）", () => {
    const db = openDb(":memory:");
    const p = wr.createWorkProject(db, { name: "知识库", code: "", taskName: "", taskCode: "", archived: false });
    wr.createWorkLogs(db, [{ date: "2026-10-12", period: "am", projectId: p.id, content: "写接口", hours: null, done: true }]);
    const all = wr.getWorkAll(db);
    expect(filterLogs(all.logs, "zsk", "all")).toHaveLength(1);
  });
});

describe("法定节假日和补班", () => {
  const sample = {
    year: 2026,
    days: [
      { name: "国庆节", date: "2026-10-01", isOffDay: true },
      { name: "国庆节", date: "2026-10-09", isOffDay: true },
      { name: "国庆节", date: "2026-10-10", isOffDay: false },
    ],
  };

  it("解析节假日数据，年份不对时报错", () => {
    expect(parseHolidayCn(sample, 2026)["2026-10-10"]).toEqual({ off: false, name: "国庆节" });
    expect(() => parseHolidayCn(sample, 2027)).toThrow();
    expect(() => parseHolidayCn({ year: 2027, days: [] }, 2027)).toThrow("还没有 2027 年");
  });

  it("下载失败时换下一个地址", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      if (urls.length === 1) throw new Error("连不上");
      return new Response(JSON.stringify(sample));
    }) as unknown as typeof fetch;
    expect(Object.keys(await fetchHolidays(2026, fake))).toHaveLength(3);
    expect(urls[1]).toContain("fastly.jsdelivr.net");
  });

  it("放假不算漏记，周末补班要记；手动设置的不被导入覆盖", async () => {
    const db = openDb(":memory:");
    wr.setSpecialDay(db, "2026-10-09", "work"); // 手动设成要上班
    const s = wr.importHolidays(db, 2026, parseHolidayCn(sample, 2026));
    expect(s.holidayYears).toEqual([2026]);
    expect(isWorkday(s, "2026-10-01")).toBe(false); // 国庆，周四
    expect(isWorkday(s, "2026-10-10")).toBe(true); // 补班，周六
    expect(isWorkday(s, "2026-10-09")).toBe(true); // 手动设置的保留
    const d = { ...data([]), settings: s };
    expect(dayStatus(d, "2026-10-01", "2026-10-20")).toBeNull();
    expect(dayStatus(d, "2026-10-10", "2026-10-20")).toBe("missed");
    expect(wr.setSpecialDay(db, "2026-10-09", null).specialDays["2026-10-09"]).toBeUndefined();
  });

  it("补班的周六也提醒写日报，放假不提醒", async () => {
    const db = openDb(":memory:");
    const sent: string[] = [];
    const send = async (_c: unknown, m: { title: string }) => void sent.push(m.title);
    setNotifyConfig(db, { ...DEFAULT_NOTIFY, target: "https://example.test/hook" });
    wr.setWorkSettings(db, { ...DEFAULT_WORK_SETTINGS, remindDaily: true });
    wr.importHolidays(db, 2026, parseHolidayCn(sample, 2026));
    // 10-10 周六补班 17:31（上海时间）
    expect(await runWorkRemind(db, new Date(Date.UTC(2026, 9, 10, 9, 31)), send)).toEqual(["daily:sent"]);
    // 10-01 国庆
    expect(await runWorkRemind(db, new Date(Date.UTC(2026, 9, 1, 9, 31)), send)).toEqual([]);
  });
});
