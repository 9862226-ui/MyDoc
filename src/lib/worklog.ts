/**
 * 工作记录：平时随手记一句，按公司日报、周报的格式整理好，方便复制粘贴。
 * 这里只有纯函数，浏览器和服务端都能用。
 */

export type Period = "am" | "pm";

export interface WorkProject {
  id: number;
  name: string;
  /** 项目编号，例如公司系统里的 10260510065 */
  code: string;
  /** 默认任务名称和编号，例如「临时任务」「LSRW_001」 */
  taskName: string;
  taskCode: string;
  archived: boolean;
  sort: number;
}

export interface WorkLog {
  id: number;
  /** YYYY-MM-DD */
  date: string;
  period: Period;
  projectId: number | null;
  content: string;
  /** 不填时按每天的正常工时平均分 */
  hours: number | null;
  /** 没做完的会放进「下周计划」 */
  done: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkSettings {
  /** 每天的正常工时 */
  dailyHours: number;
  /** 下班提醒写日报 */
  remindDaily: boolean;
  /** HH:MM */
  remindTime: string;
  /** 哪几天提醒，0 是周日 */
  remindDays: number[];
  /** 每周提醒交周报 */
  remindWeekly: boolean;
  weeklyDay: number;
  weeklyTime: string;
  /** 提醒消息里带上整理好的日报、周报 */
  remindWithReport: boolean;
}

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  dailyHours: 8,
  remindDaily: false,
  remindTime: "17:30",
  remindDays: [1, 2, 3, 4, 5],
  remindWeekly: false,
  weeklyDay: 5,
  weeklyTime: "16:00",
  remindWithReport: true,
};

/** 下班提醒的状态（给页面显示） */
export interface RemindInfo {
  /** 是否已经在「设置 › 提醒推送」里配好了推送方式 */
  pushReady: boolean;
  last?: { at: string; ok: boolean; message: string };
}

/** 手动改过的日报字段；没改过的按记录自动生成 */
export interface DailyFields {
  amSummary?: string;
  pmSummary?: string;
}

export interface WeeklyFields {
  summary?: string;
  plan?: string;
}

export type ReportKind = "daily" | "weekly";

export interface WorkData {
  projects: WorkProject[];
  logs: WorkLog[];
  settings: WorkSettings;
  /** key 为 "daily:2026-10-10" 或 "weekly:2026-10-05"（周一） */
  reports: Record<string, DailyFields & WeeklyFields>;
  remind: RemindInfo;
}

export const reportKey = (kind: ReportKind, key: string) => `${kind}:${key}`;

/* ---------- 日期 ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

function parse(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function shiftDate(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** 这一周的周一 */
export function weekStart(date: string): string {
  const day = parse(date).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}

/** ISO 周次（周一开始，和大部分公司系统一致） */
export function isoWeek(date: string): number {
  // 这一周的周四在哪一年，就算哪一年的第几周
  const thursday = parse(shiftDate(weekStart(date), 3));
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export const weekdayLabel = (date: string) => WEEKDAYS[parse(date).getUTCDay()];

/* ---------- 文本 ---------- */

/** 去掉首尾空白和重复的条目，保持原来的顺序 */
function uniqueLines(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim().replace(/[。；;，,]$/, "");
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** 多行编号列表：1. xxx\n2. yyy */
export const numbered = (items: string[]) =>
  uniqueLines(items)
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");

/** 一行内的编号列表，适合表格里的「工作内容」：1. xxx 2. yyy */
export const numberedInline = (items: string[]) => {
  const lines = uniqueLines(items);
  return lines.length === 1 ? lines[0] : lines.map((s, i) => `${i + 1}. ${s}`).join(" ");
};

/** 一次粘贴多行时拆成多条；去掉行首的「1.」「-」之类 */
export function splitEntries(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*(?:\d+[.、)）]|[-*•·])\s*/, "").trim())
    .filter(Boolean);
}

/** 当前时间算上午还是下午（12 点前算上午） */
export const currentPeriod = (now = new Date()): Period => (now.getHours() < 12 ? "am" : "pm");

/* ---------- 日报 ---------- */

export interface DailyRow {
  projectId: number | null;
  projectName: string;
  projectCode: string;
  taskName: string;
  taskCode: string;
  status: "已完成" | "进行中";
  progress: number;
  hours: number;
  content: string;
}

export interface DailyReport {
  date: string;
  hours: number;
  amProject: string;
  pmProject: string;
  rows: DailyRow[];
  amSummary: string;
  pmSummary: string;
  /** 自动生成的总结（用来判断是否手动改过） */
  autoAmSummary: string;
  autoPmSummary: string;
  logCount: number;
}

const UNASSIGNED = "未选择项目";

const roundHalf = (n: number) => Math.round(n * 2) / 2;

/** 按项目分摊工时：填了工时的用填的，其余平均分剩下的正常工时 */
function hoursByProject(logs: WorkLog[], dailyHours: number): Map<number | null, number> {
  const explicit = logs.reduce((s, l) => s + (l.hours ?? 0), 0);
  const unset = logs.filter((l) => l.hours === null).length;
  const each = unset ? Math.max(0, dailyHours - explicit) / unset : 0;
  const raw = new Map<number | null, number>();
  for (const l of logs) raw.set(l.projectId, (raw.get(l.projectId) ?? 0) + (l.hours ?? each));
  // 四舍五入到半小时，差额算到最后一个项目上，保证合计不变
  const total = roundHalf([...raw.values()].reduce((a, b) => a + b, 0));
  const out = new Map<number | null, number>();
  let sum = 0;
  const keys = [...raw.keys()];
  keys.forEach((k, i) => {
    const v = i === keys.length - 1 ? Math.max(0, total - sum) : roundHalf(raw.get(k) ?? 0);
    out.set(k, v);
    sum += v;
  });
  return out;
}

/** 记录最多的项目；一样多时取先记的 */
function mainProject(logs: WorkLog[], name: (id: number | null) => string): string {
  const count = new Map<number | null, number>();
  for (const l of logs) count.set(l.projectId, (count.get(l.projectId) ?? 0) + 1);
  let best: number | null | undefined;
  for (const [k, v] of count) if (best === undefined || v > (count.get(best) ?? 0)) best = k;
  return best === undefined ? "" : name(best);
}

function projectLookup(projects: WorkProject[]) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return {
    get: (id: number | null) => (id === null ? undefined : byId.get(id)),
    name: (id: number | null) => (id === null ? UNASSIGNED : (byId.get(id)?.name ?? UNASSIGNED)),
  };
}

const byTime = (a: WorkLog, b: WorkLog) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id;

export function buildDaily(data: WorkData, date: string): DailyReport {
  const logs = data.logs.filter((l) => l.date === date).sort(byTime);
  const lookup = projectLookup(data.projects);
  const hours = hoursByProject(logs, data.settings.dailyHours);

  const rows: DailyRow[] = [];
  for (const [projectId, h] of hours) {
    const items = logs.filter((l) => l.projectId === projectId);
    const p = lookup.get(projectId);
    const done = items.every((l) => l.done);
    rows.push({
      projectId,
      projectName: lookup.name(projectId),
      projectCode: p?.code ?? "",
      taskName: p?.taskName ?? "",
      taskCode: p?.taskCode ?? "",
      status: done ? "已完成" : "进行中",
      progress: done ? 100 : 50,
      hours: h,
      content: numberedInline(items.map((l) => l.content)),
    });
  }

  const am = logs.filter((l) => l.period === "am");
  const pm = logs.filter((l) => l.period === "pm");
  // 只记了半天时，上午、下午的总结都用全天的内容（公司系统两栏都要填）
  const autoAm = numbered((am.length ? am : logs).map((l) => l.content));
  const autoPm = numbered((pm.length ? pm : logs).map((l) => l.content));
  const fields = data.reports[reportKey("daily", date)] ?? {};
  const total = [...hours.values()].reduce((a, b) => a + b, 0);

  return {
    date,
    hours: logs.length ? total : data.settings.dailyHours,
    amProject: mainProject(am.length ? am : logs, lookup.name),
    pmProject: mainProject(pm.length ? pm : logs, lookup.name),
    rows,
    amSummary: fields.amSummary ?? autoAm,
    pmSummary: fields.pmSummary ?? autoPm,
    autoAmSummary: autoAm,
    autoPmSummary: autoPm,
    logCount: logs.length,
  };
}

/* ---------- 周报 ---------- */

export interface WeeklyDay {
  date: string;
  weekday: string;
  hours: number;
  projectName: string;
  projectCode: string;
  content: string;
}

export interface WeeklyReport {
  week: number;
  start: string;
  end: string;
  workDays: number;
  hours: number;
  days: WeeklyDay[];
  summary: string;
  plan: string;
  autoSummary: string;
  autoPlan: string;
  logCount: number;
}

export function buildWeekly(data: WorkData, date: string): WeeklyReport {
  const start = weekStart(date);
  const end = shiftDate(start, 6);
  const logs = data.logs.filter((l) => l.date >= start && l.date <= end).sort(byTime);
  const lookup = projectLookup(data.projects);

  const days: WeeklyDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDate(start, i);
    const dayLogs = logs.filter((l) => l.date === d);
    if (!dayLogs.length) continue;
    const daily = buildDaily(data, d);
    const main = mainProject(dayLogs, (id) => String(id));
    const p = lookup.get(main === "null" ? null : Number(main));
    days.push({
      date: d,
      weekday: weekdayLabel(d),
      hours: daily.hours,
      projectName: p?.name ?? UNASSIGNED,
      projectCode: p?.code ?? "",
      content: numberedInline(dayLogs.map((l) => l.content)),
    });
  }

  const autoSummary = numbered(logs.map((l) => l.content));
  // 没做完的事项自动放进下周计划
  const autoPlan = numbered(logs.filter((l) => !l.done).map((l) => `继续${l.content.replace(/^继续/, "")}`));
  const fields = data.reports[reportKey("weekly", start)] ?? {};

  return {
    week: isoWeek(start),
    start,
    end,
    workDays: days.length,
    hours: days.reduce((s, d) => s + d.hours, 0),
    days,
    summary: fields.summary ?? autoSummary,
    plan: fields.plan ?? autoPlan,
    autoSummary,
    autoPlan,
    logCount: logs.length,
  };
}

/** 整张日报的纯文本，方便发到微信、钉钉 */
export function dailyText(r: DailyReport): string {
  const lines = [
    `工作日报 ${r.date}（${weekdayLabel(r.date)}）`,
    `工时：${r.hours} 小时`,
    "",
    "上午：",
    r.amSummary,
    "",
    "下午：",
    r.pmSummary,
  ];
  return lines.join("\n");
}

export function weeklyText(r: WeeklyReport): string {
  const lines = [
    `员工周报 第 ${r.week} 周（${r.start} ~ ${r.end}）`,
    `工作 ${r.workDays} 天，共 ${r.hours} 小时`,
    "",
    "本周总结：",
    r.summary,
  ];
  if (r.plan.trim()) lines.push("", "下周计划：", r.plan);
  return lines.join("\n");
}
