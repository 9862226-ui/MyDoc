/**
 * 常用筛选（保存的视图）：把某个列表的筛选条件存成一个地址，在左边栏「视图」里一点就回来。
 * 链接列表：/all?tag=技术&platform=feishu；工作记录：/work?do=weekly&q=切片&project=3
 */

export type ViewKind = "links" | "work";

export interface SavedView {
  id: string;
  name: string;
  href: string;
  kind: ViewKind;
}

export const MAX_VIEWS = 30;

/** 链接列表的筛选条件（都为空表示没有筛选） */
export interface LinkFilters {
  q: string;
  platform: string;
  tag: string;
  kind: string;
  sort: string;
}

const LINK_KEYS = ["q", "platform", "tag", "kind", "sort"] as const;

/** 视图地址里的链接筛选；地址里没有任何筛选参数时返回 null（用户自己的设置不动） */
export function readLinkFilters(params: URLSearchParams): Partial<LinkFilters> | null {
  if (!LINK_KEYS.some((k) => params.has(k))) return null;
  return Object.fromEntries(LINK_KEYS.map((k) => [k, params.get(k) ?? ""]));
}

const withQuery = (path: string, entries: [string, string][]) => {
  const qs = new URLSearchParams(entries.filter(([, v]) => v)).toString();
  return qs ? `${path}?${qs}` : path;
};

export function linkViewHref(path: string, f: LinkFilters): string {
  return withQuery(
    path,
    LINK_KEYS.map((k) => [k, f[k]]),
  );
}

/** 工作记录的筛选：关键字、项目（all / none / id）、提交状态 */
export interface WorkFilters {
  q: string;
  project: string;
  status: string;
}

export function workViewHref(f: WorkFilters): string {
  return withQuery("/work", [
    ["do", "weekly"],
    ["q", f.q.trim()],
    ["project", f.project === "all" ? "" : f.project],
    ["status", f.status === "all" ? "" : f.status],
  ]);
}

export function readWorkFilters(params: URLSearchParams): WorkFilters | null {
  if (!["q", "project", "status"].some((k) => params.has(k))) return null;
  return { q: params.get("q") ?? "", project: params.get("project") || "all", status: params.get("status") || "all" };
}

/** 两个地址是不是同一个视图（参数顺序不同也算） */
export function sameHref(a: string, b: string): boolean {
  const norm = (s: string) => {
    const [path, qs = ""] = s.split("?");
    const p = new URLSearchParams(qs);
    p.sort();
    return `${path}?${p.toString()}`;
  };
  return norm(a) === norm(b);
}

/** 只允许站内地址，防止存进去一个外部网址 */
export const isLocalHref = (href: string) => href.startsWith("/") && !href.startsWith("//") && !href.includes("\\");
