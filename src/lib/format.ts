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

/** 列表里的时间：今天 10:42、昨天 18:20、10月9日、2025年3月1日 */
export function shortTime(iso: string, now = new Date()): string {
  const t = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const days = daysUntil(localDate(now), t);
  if (days <= 0) return `今天 ${hm}`;
  if (days === 1) return `昨天 ${hm}`;
  return t.getFullYear() === now.getFullYear()
    ? `${t.getMonth() + 1}月${t.getDate()}日`
    : `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日`;
}

/** 日期 YYYY-MM-DD 显示成「10月19日」，不是今年时带上年份 */
export function shortDate(date: string, today = new Date()): string {
  const [y, m, d] = date.split("-").map(Number);
  return y === today.getFullYear() ? `${m}月${d}日` : `${y}年${m}月${d}日`;
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
  return { label: `${shortDate(date, today)}到期`, level: "later" };
}
