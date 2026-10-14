"use client";

import useSWR, { mutate } from "swr";
import type { AppData, Link } from "./types";

export const DATA_KEY = "/api/data";
export const TRASH_KEY = "/api/trash";

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = opts.body !== undefined;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (hasBody ? "POST" : "GET"),
      headers: hasBody ? { "content-type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    // 浏览器只给「Failed to fetch」「Load failed」这类英文，换成看得懂的
    throw new Error(navigator.onLine === false ? "网络已断开，没有保存成功" : "连不上服务器，没有保存成功，请稍后重试");
  }
  if (res.status === 401 && !url.startsWith("/api/auth")) {
    window.location.href = "/login";
    throw new Error("未登录或登录已过期");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `请求失败（${res.status}）`);
  return data as T;
}

export function useAppData() {
  return useSWR<AppData>(DATA_KEY, (url: string) => api<AppData>(url));
}

export function refreshData() {
  // 链接备注、摘录里可能有引用，反向链接一起刷新
  void mutate(BACKLINKS_KEY);
  return mutate(DATA_KEY);
}

/** 反向链接（见 lib/refs） */
export const BACKLINKS_KEY = "/api/refs/backlinks";

export function useTrash() {
  return useSWR<Link[]>(TRASH_KEY, (url: string) => api<Link[]>(url));
}

/** 记录一次访问（不等待结果），并立即更新本地数据 */
export function trackVisit(id: number): void {
  const url = `/api/links/${id}/visit`;
  if (!navigator.sendBeacon?.(url)) void fetch(url, { method: "POST", keepalive: true });
  const t = new Date().toISOString();
  void mutate<AppData>(
    DATA_KEY,
    (d) =>
      d && {
        ...d,
        links: d.links.map((l) => (l.id === id ? { ...l, visitCount: l.visitCount + 1, lastVisitedAt: t } : l)),
      },
    { revalidate: false },
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非 https 访问时 clipboard API 不可用，退回到老办法
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** 链接 + 提取码，适合直接发给别人 */
export function shareText(link: Link, withTitle: boolean): string {
  const parts = withTitle ? [link.title, link.url] : [link.url];
  if (link.accessCode) parts.push(`提取码：${link.accessCode}`);
  return parts.join(withTitle ? "\n" : " ");
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式等情况下忽略
  }
}
