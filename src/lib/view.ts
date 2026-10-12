import { detectPlatform } from "./platforms";
import type { AppData, Group, Link, Project } from "./types";

export type ViewSpec =
  | { kind: "inbox" }
  | { kind: "recent" }
  | { kind: "favorites" }
  | { kind: "expiring" }
  | { kind: "all" }
  | { kind: "project"; id: number }
  | { kind: "tag"; name: string };

export type SortKey = "updated" | "created" | "visits" | "visited" | "title";

export const SORT_LABELS: Record<SortKey, string> = {
  updated: "最近更新",
  created: "最近添加",
  visits: "访问最多",
  visited: "最近访问",
  title: "按名称",
};

/** 多少天内到期算「即将过期」 */
export const EXPIRING_DAYS = 7;
export const RECENT_LIMIT = 50;

/** 距离到期还有几天（按本地日期算），已过期为负数 */
export function daysUntil(date: string, today = new Date()): number {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((target - base) / 86400_000);
}

export function isExpiring(link: Link, today = new Date()): boolean {
  return !!link.expiresAt && daysUntil(link.expiresAt, today) <= EXPIRING_DAYS;
}

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

const byDesc = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

export function linksForView(data: AppData, view: ViewSpec): Link[] {
  const links = data.links;
  switch (view.kind) {
    case "inbox":
      return links.filter((l) => l.projectId === null);
    case "recent":
      return links
        .filter((l) => l.lastVisitedAt)
        .sort((a, b) => byDesc(a.lastVisitedAt, b.lastVisitedAt))
        .slice(0, RECENT_LIMIT);
    case "favorites":
      return links.filter((l) => l.favorite);
    case "expiring":
      return links.filter((l) => isExpiring(l)).sort((a, b) => a.expiresAt!.localeCompare(b.expiresAt!));
    case "all":
      return links;
    case "project":
      return links.filter((l) => l.projectId === view.id);
    case "tag":
      return links.filter((l) => l.tags.some((t) => t.toLowerCase() === view.name.toLowerCase()));
  }
}

/** 这个视图本身是否已有固定顺序（不提供排序选项） */
export function hasFixedOrder(view: ViewSpec): boolean {
  return view.kind === "recent" || view.kind === "expiring";
}

/** 置顶的排在前面，其余按 key 排序 */
export function sortLinks(links: Link[], key: SortKey): Link[] {
  const cmp: Record<SortKey, (a: Link, b: Link) => number> = {
    updated: (a, b) => byDesc(a.updatedAt, b.updatedAt),
    created: (a, b) => byDesc(a.createdAt, b.createdAt) || b.id - a.id,
    visits: (a, b) => b.visitCount - a.visitCount || byDesc(a.lastVisitedAt, b.lastVisitedAt),
    visited: (a, b) => byDesc(a.lastVisitedAt, b.lastVisitedAt),
    title: (a, b) => collator.compare(a.title, b.title),
  };
  return [...links].sort((a, b) => Number(b.pinned) - Number(a.pinned) || cmp[key](a, b));
}

export interface ProjectInfo {
  project: Project;
  group: Group | undefined;
}

export function projectIndex(data: AppData): Map<number, ProjectInfo> {
  const groups = new Map(data.groups.map((g) => [g.id, g]));
  return new Map(data.projects.map((p) => [p.id, { project: p, group: groups.get(p.groupId) }]));
}

export function projectPathLabel(info: ProjectInfo | undefined): string {
  if (!info) return "收件箱";
  return info.group ? `${info.group.name} / ${info.project.name}` : info.project.name;
}

function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function linkHaystack(link: Link, info: ProjectInfo | undefined): string {
  return [link.title, link.url, link.note, link.tags.join(" "), projectPathLabel(info), detectPlatform(link.url).name]
    .join("\n")
    .toLowerCase();
}

export interface Filters {
  q: string;
  platform: string;
  tag: string;
}

export function applyFilters(links: Link[], data: AppData, f: Filters): Link[] {
  const ts = terms(f.q);
  const index = ts.length ? projectIndex(data) : null;
  return links.filter((l) => {
    if (f.platform && detectPlatform(l.url).key !== f.platform) return false;
    if (f.tag && !l.tags.includes(f.tag)) return false;
    if (ts.length) {
      const hay = linkHaystack(l, l.projectId === null ? undefined : index!.get(l.projectId));
      if (!ts.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

export interface SearchResult {
  links: Link[];
  projects: ProjectInfo[];
}

/** 全局搜索：所有关键词都要匹配；标题匹配、常用的排前面 */
export function search(data: AppData, query: string, limit = 30): SearchResult {
  const ts = terms(query);
  if (!ts.length) return { links: [], projects: [] };
  const index = projectIndex(data);
  const q = query.trim().toLowerCase();

  const scored: [Link, number][] = [];
  for (const l of data.links) {
    const info = l.projectId === null ? undefined : index.get(l.projectId);
    const hay = linkHaystack(l, info);
    if (!ts.every((t) => hay.includes(t))) continue;
    const title = l.title.toLowerCase();
    let score = 0;
    if (title === q) score += 200;
    else if (title.startsWith(q)) score += 120;
    else if (title.includes(q)) score += 80;
    score += ts.filter((t) => title.includes(t)).length * 20;
    score += Math.min(l.visitCount, 50) / 2;
    if (l.favorite) score += 10;
    if (l.pinned) score += 5;
    scored.push([l, score]);
  }
  scored.sort((a, b) => b[1] - a[1] || byDesc(a[0].lastVisitedAt, b[0].lastVisitedAt));

  const projects = [...index.values()].filter((info) => {
    const hay = `${info.project.name}\n${info.group?.name ?? ""}`.toLowerCase();
    return ts.every((t) => hay.includes(t));
  });
  projects.sort((a, b) => Number(a.project.archived) - Number(b.project.archived));

  return { links: scored.slice(0, limit).map(([l]) => l), projects: projects.slice(0, 6) };
}
