import type { AppData, Link } from "./types";

function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function projectPath(data: AppData, link: Link): [string, string] {
  const project = data.projects.find((p) => p.id === link.projectId);
  const group = project && data.groups.find((g) => g.id === project.groupId);
  return [group?.name ?? "", project?.name ?? "收件箱"];
}

/** 导出 CSV（带 BOM，Excel 直接打开不乱码） */
export function toCsv(data: AppData): string {
  const header = ["分组", "项目", "标题", "链接", "提取码", "有效期", "标签", "备注", "访问次数", "最近访问", "添加时间"];
  const rows = data.links.map((l) => [
    ...projectPath(data, l),
    l.title,
    l.url,
    l.accessCode,
    l.expiresAt,
    l.tags.join(" "),
    l.note,
    l.visitCount,
    l.lastVisitedAt,
    l.createdAt,
  ]);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 导出为浏览器可导入的书签 HTML，按 分组 / 项目 建文件夹 */
export function toBookmarksHtml(data: AppData): string {
  const ts = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  const linkLine = (l: Link, indent: string) =>
    `${indent}<DT><A HREF="${esc(l.url)}" ADD_DATE="${ts(l.createdAt)}">${esc(l.title)}</A>\n`;
  const folder = (name: string, indent: string, body: string) =>
    `${indent}<DT><H3>${esc(name)}</H3>\n${indent}<DL><p>\n${body}${indent}</DL><p>\n`;

  let body = "";
  for (const g of data.groups) {
    let groupBody = "";
    for (const p of data.projects.filter((p) => p.groupId === g.id)) {
      const links = data.links.filter((l) => l.projectId === p.id);
      groupBody += folder(p.name, "        ", links.map((l) => linkLine(l, "            ")).join(""));
    }
    body += folder(g.name, "    ", groupBody);
  }
  const inbox = data.links.filter((l) => l.projectId === null);
  if (inbox.length) body += folder("收件箱", "    ", inbox.map((l) => linkLine(l, "        ")).join(""));

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${folder("MyDoc", "", body)}</DL><p>
`;
}
