import { daysUntil } from "./view";

/** 「刚刚」「5 分钟前」「昨天」这样的相对时间 */
export function relativeTime(iso: string | null, now = new Date()): string {
  if (!iso) return "从未";
  const t = new Date(iso);
  const diff = (now.getTime() - t.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400 && t.getDate() === now.getDate()) return `${Math.floor(diff / 3600)} 小时前`;
  const days = daysUntil(localDate(now), t);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return t.getFullYear() === now.getFullYear() ? `${t.getMonth() + 1}月${t.getDate()}日` : localDate(t);
}

/** 本地日期 YYYY-MM-DD */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

export interface ExpiryInfo {
  label: string;
  level: "expired" | "soon" | "later";
}

export function expiryInfo(date: string, today = new Date()): ExpiryInfo {
  const days = daysUntil(date, today);
  if (days < 0) return { label: "已过期", level: "expired" };
  if (days === 0) return { label: "今天到期", level: "soon" };
  if (days === 1) return { label: "明天到期", level: "soon" };
  if (days <= 7) return { label: `${days} 天后到期`, level: "soon" };
  return { label: `${date} 到期`, level: "later" };
}
