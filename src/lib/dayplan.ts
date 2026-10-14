/**
 * 每天的计划（开工）和收工：早上从「前几天没处理的计划、本周计划、没做完的记录、会议待办」里挑几件今天要做的事；
 * 做完打勾就记成一条工作记录；下班时核对，没做完的顺延到下一个工作日。
 * 计划存在日报的字段里（plan），不单独建表
 */
import { parseTasks, type Meeting } from "./meetings";
import { isWorkday, shiftDate, weekdayLabel, type PlanItem, type WorkLog, type WorkSettings } from "./worklog";

/** 计划从哪来：手动添加、前一天顺延、本周计划、没做完的记录、会议待办、前几天没处理的计划 */
export type PlanSource = "manual" | "carry" | "weekly" | "unfinished" | "meeting" | "leftover";
/** 待做、做完了、顺延到下一个工作日、不做了 */
export type PlanStatus = "todo" | "done" | "carried" | "dropped";

export interface DayPlanItem {
  id: string;
  text: string;
  projectId: number | null;
  source: PlanSource;
  status: PlanStatus;
  /** 打勾时记的那条工作记录 */
  logId?: number;
  /** 工作记录是打勾时新建的（取消打勾时删掉它） */
  createdLog?: boolean;
  /** 顺延到哪天 */
  carriedTo?: string;
  /** 来源的标识，例如顺延来的是「原日期:原 id」，用来撤销顺延 */
  ref?: string;
}

/** 开工时可以挑的事 */
export interface PlanCandidate {
  key: string;
  text: string;
  projectId: number | null;
  source: PlanSource;
  /** 显示在后面的说明，例如「10月13日 没做完」「会议：周会」 */
  note: string;
  ref?: string;
}

export interface DayPlan {
  date: string;
  items: DayPlanItem[];
  shutdownAt?: string;
  /** 下一个工作日（顺延到这天） */
  nextWorkday: string;
  candidates: PlanCandidate[];
}

export const SOURCE_LABEL: Record<PlanSource, string> = {
  manual: "",
  carry: "顺延",
  weekly: "周计划",
  unfinished: "没做完",
  meeting: "会议",
  leftover: "前几天",
};

const mmdd = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;

/** 比较两件事是不是同一件：去掉「继续」、结尾标点，不分大小写 */
const norm = (s: string) =>
  s
    .trim()
    .replace(/^继续[：:]?/, "")
    .replace(/[。；;，,.]$/, "")
    .toLowerCase();
export const sameText = (a: string, b: string) => norm(a) === norm(b);

/** 下一个工作日（看工作日设置和节假日、调休），最多往后找 30 天 */
export function nextWorkday(settings: Pick<WorkSettings, "remindDays" | "specialDays">, date: string): string {
  for (let i = 1; i <= 30; i++) {
    const d = shiftDate(date, i);
    if (isWorkday(settings, d)) return d;
  }
  return shiftDate(date, 1);
}

/** 这件事今天做完了吗：打过勾，或者今天有一条一样内容、已完成的记录 */
export function isPlanDone(item: DayPlanItem, todayLogs: WorkLog[]): boolean {
  if (item.status === "done") return true;
  return item.status === "todo" && todayLogs.some((l) => l.done && sameText(l.content, item.text));
}

/** 进度：做完几件 / 一共几件（顺延和不做了的不算） */
export function planProgress(items: DayPlanItem[], todayLogs: WorkLog[]): { done: number; total: number } {
  const active = items.filter((i) => i.status === "todo" || i.status === "done");
  return { done: active.filter((i) => isPlanDone(i, todayLogs)).length, total: active.length };
}

/**
 * 开工时可以挑的事，按来源排：前几天没处理的计划、本周计划、没做完的记录、会议待办。
 * 已经在今天计划里、今天已经记过的、重复的都去掉
 */
export function planCandidates(input: {
  date: string;
  items: DayPlanItem[];
  /** 最近几天（不含今天）的记录 */
  logs: WorkLog[];
  todayLogs: WorkLog[];
  /** 前几天的计划，新的在前 */
  leftovers: { date: string; items: DayPlanItem[] }[];
  /** 本周计划里还没完成的 */
  weekly: PlanItem[];
  /** 最近的会议 */
  meetings: Meeting[];
}): PlanCandidate[] {
  const seen: string[] = [...input.items.map((i) => i.text), ...input.todayLogs.map((l) => l.content)];
  const out: PlanCandidate[] = [];
  const push = (c: PlanCandidate) => {
    if (!c.text.trim() || seen.some((t) => sameText(t, c.text))) return;
    seen.push(c.text);
    out.push(c);
  };

  for (const day of input.leftovers) {
    for (const it of day.items) {
      if (it.status !== "todo") continue;
      push({
        key: `leftover:${day.date}:${it.id}`,
        text: it.text,
        projectId: it.projectId,
        source: "leftover",
        note: `${mmdd(day.date)} ${weekdayLabel(day.date)}的计划`,
        ref: `${day.date}:${it.id}`,
      });
    }
  }

  for (const p of input.weekly) {
    push({ key: `weekly:${p.id}`, text: p.text, projectId: null, source: "weekly", note: "本周计划" });
  }

  // 没做完的记录：之后又记过一样内容、已完成的不算
  const recent = [...input.logs].sort((a, b) => b.date.localeCompare(a.date));
  for (const l of recent) {
    if (l.done) continue;
    const later = [...input.logs, ...input.todayLogs].some(
      (x) => x.done && x.date >= l.date && sameText(x.content, l.content),
    );
    if (later) continue;
    push({
      key: `unfinished:${l.id}`,
      text: l.content,
      projectId: l.projectId,
      source: "unfinished",
      note: `${mmdd(l.date)} 没做完`,
    });
  }

  // 会议里没打勾、也还没记进工作记录的待办
  const logged = [...input.logs, ...input.todayLogs].map((l) => l.content);
  for (const m of input.meetings) {
    for (const t of parseTasks(m.notes)) {
      if (t.done || logged.some((c) => sameText(c, t.text))) continue;
      push({
        key: `meeting:${m.id}:${t.index}`,
        text: t.text,
        projectId: m.projectId,
        source: "meeting",
        note: `会议：${m.title}`,
      });
    }
  }
  return out;
}
