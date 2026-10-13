import type { DB } from "./db";

/** 简单的键值设置，值以 JSON 保存；读取时和默认值合并，新加的字段也有默认值 */
export function getSetting<T extends object>(db: DB, key: string, defaults: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return { ...defaults };
  try {
    return { ...defaults, ...(JSON.parse(row.value) as Partial<T>) };
  } catch {
    return { ...defaults };
  }
}

export function setSetting(db: DB, key: string, value: object): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, JSON.stringify(value));
}

/** 密码类字段在页面上显示成这个；保存时收到它表示「不修改」 */
export const SECRET_MASK = "••••••••";

/** 返回给页面前把密码类字段换成掩码 */
export function maskSecrets<T extends object>(value: T, keys: (keyof T)[]): T {
  const out = { ...value };
  for (const k of keys) if (out[k]) (out as Record<keyof T, unknown>)[k] = SECRET_MASK;
  return out;
}

/** 保存时：值还是掩码的字段沿用原来的 */
export function keepSecrets<T extends object>(next: T, prev: T, keys: (keyof T)[]): T {
  const out = { ...next };
  for (const k of keys) if (out[k] === SECRET_MASK) out[k] = prev[k];
  return out;
}

export interface ZonedTime {
  /** YYYY-MM-DD */
  date: string;
  hour: number;
  /** 年月日时分和该时区一致的 Date，可以直接交给按本地日期计算的函数 */
  local: Date;
}

/** 某个时区的当前日期和时间；时区写错时用服务器本地时间 */
export function zonedNow(timeZone: string, now = new Date()): ZonedTime {
  let parts: Record<string, number>;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    parts = Object.fromEntries(
      fmt
        .formatToParts(now)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, Number(p.value)]),
    );
  } catch {
    parts = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
    };
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    hour: parts.hour,
    local: new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  };
}
