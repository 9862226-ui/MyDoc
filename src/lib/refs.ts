/**
 * 内容互相引用：在 Markdown 里写 [[log:12|修复切片问题]]，显示成可以点的引用；
 * 被引用的地方会列出「谁引用了它」（反向链接）。竖线后面是插入时的标题，显示用，不影响跳转
 */

export type RefType = "log" | "meeting" | "snippet" | "link";

export const REF_TYPES: RefType[] = ["log", "meeting", "snippet", "link"];

export const REF_LABEL: Record<RefType, string> = {
  log: "工作记录",
  meeting: "会议纪要",
  snippet: "摘录",
  link: "链接",
};

/** 匹配一个引用；标题里不能有 ] 和换行 */
const REF_SOURCE = String.raw`\[\[(log|meeting|snippet|link):(\d+)(?:\|([^\]\n]*))?\]\]`;
export const refRegExp = (flags = "g") => new RegExp(REF_SOURCE, flags);

export interface Ref {
  type: RefType;
  id: number;
  label: string;
}

/** 一段文字里的所有引用（同一个只算一次） */
export function parseRefs(text: string): Ref[] {
  const out: Ref[] = [];
  for (const m of text.matchAll(refRegExp())) {
    const ref = { type: m[1] as RefType, id: Number(m[2]), label: (m[3] ?? "").trim() };
    if (!out.some((r) => r.type === ref.type && r.id === ref.id)) out.push(ref);
  }
  return out;
}

export const refKey = (type: RefType, id: number) => `${type}:${id}`;

/** 插入到正文里的引用文字；标题去掉会破坏格式的字符，太长的截断 */
export function refToken(type: RefType, id: number, title: string): string {
  const label = title.replace(/[\]|\n\r]+/g, " ").trim();
  const short = label.length > 40 ? `${label.slice(0, 40)}…` : label;
  return `[[${type}:${id}|${short}]]`;
}

/** 点引用时去的地址：由服务端查到对应的页面再跳过去 */
export const refHref = (type: RefType, id: number) => `/go/${type}/${id}`;

/** 去掉引用的格式，只留标题（列表摘要、纯文本里用） */
export const refsToText = (text: string) =>
  text.replace(refRegExp(), (_m, type: RefType, _id, label?: string) => label?.trim() || REF_LABEL[type]);

/** 引用别人的内容，在被引用的地方显示 */
export interface RefSource {
  type: RefType;
  id: number;
  title: string;
  /** 工作记录、会议的日期 */
  date?: string;
}

/** 插入引用时可以选的内容 */
export interface RefTarget extends RefSource {
  /** 第二行的说明：日期、项目、网址…… */
  subtitle: string;
}
