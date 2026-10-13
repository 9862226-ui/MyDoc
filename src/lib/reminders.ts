import type { Reminder, RepeatKind } from "./types";
import { daysUntil } from "./view";

export const REPEAT_LABELS: Record<RepeatKind, string> = { none: "不重复", monthly: "每月", yearly: "每年" };

/** 「提前提醒」的可选天数 */
export const REMIND_DAY_OPTIONS = [0, 1, 3, 7, 15, 30];

export const remindDaysLabel = (days: number) => (days === 0 ? "到期当天" : `提前 ${days} 天`);

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

/**
 * 下一个周期的到期日。按月重复时，日期超过当月天数取当月最后一天；
 * 本来就在月底的（比如 4月30日）下个月也在月底（5月31日）。
 */
export function nextDueDate(date: string, repeat: RepeatKind): string {
  if (repeat === "none") return date;
  const [y, m, d] = date.split("-").map(Number);
  const atMonthEnd = d === lastDay(y, m);
  let ny = y;
  let nm = m;
  if (repeat === "monthly") {
    nm = m === 12 ? 1 : m + 1;
    ny = m === 12 ? y + 1 : y;
  } else {
    ny = y + 1;
  }
  const max = lastDay(ny, nm);
  const nd = repeat === "monthly" && atMonthEnd ? max : Math.min(d, max);
  return `${ny}-${pad(nm)}-${pad(nd)}`;
}

export type ReminderLevel = "done" | "overdue" | "soon" | "later";

export interface ReminderState {
  level: ReminderLevel;
  /** 距离到期还有几天，已过期为负数 */
  days: number;
  label: string;
}

export function reminderState(r: Reminder, today = new Date()): ReminderState {
  const days = daysUntil(r.dueDate, today);
  if (r.doneAt) return { level: "done", days, label: "已完成" };
  if (days < 0) return { level: "overdue", days, label: `已过期 ${-days} 天` };
  const level = days <= r.remindDays ? "soon" : "later";
  if (days === 0) return { level, days, label: "今天到期" };
  if (days === 1) return { level, days, label: "明天到期" };
  if (days <= 60) return { level, days, label: `${days} 天后到期` };
  return { level, days, label: `${Math.round(days / 30)} 个月后到期` };
}

/** 需要处理：已过期，或进入了提前提醒的时间 */
export function isReminderDue(r: Reminder, today = new Date()): boolean {
  const level = reminderState(r, today).level;
  return level === "overdue" || level === "soon";
}

/** 按到期日排序，近的在前 */
export function sortReminders(list: Reminder[]): Reminder[] {
  return [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);
}
