import { refsToText } from "./refs";

/**
 * Markdown 编辑的文本操作（纯函数，方便测试）：加粗、列表、待办、回车续列表、Tab 缩进、打勾。
 * 每个操作返回「把 [start, end) 换成 insert，然后选中 [selStart, selEnd)」。
 */

export interface EditOp {
  start: number;
  end: number;
  insert: string;
  selStart: number;
  selEnd: number;
}

const lineStart = (text: string, pos: number) => text.lastIndexOf("\n", pos - 1) + 1;
const lineEnd = (text: string, pos: number) => {
  const i = text.indexOf("\n", pos);
  return i < 0 ? text.length : i;
};

/** 用 before / after 包住选中的文字；没选中时插入占位文字并选中它 */
export function wrapOp(text: string, s: number, e: number, before: string, after: string, placeholder: string): EditOp {
  const sel = text.slice(s, e);
  // 已经包着的再点一次就去掉
  if (sel && text.slice(s - before.length, s) === before && text.slice(e, e + after.length) === after) {
    return {
      start: s - before.length,
      end: e + after.length,
      insert: sel,
      selStart: s - before.length,
      selEnd: e - before.length,
    };
  }
  const inner = sel || placeholder;
  return {
    start: s,
    end: e,
    insert: before + inner + after,
    selStart: s + before.length,
    selEnd: s + before.length + inner.length,
  };
}

export type LineKind = "ul" | "ol" | "task" | "quote" | "h2";

const PREFIX_RE: Record<LineKind, RegExp> = {
  ul: /^(\s*)[-*+]\s(?!\[[ xX]\])/,
  ol: /^(\s*)\d+[.)]\s/,
  task: /^(\s*)[-*+]\s\[[ xX]\]\s/,
  quote: /^(\s*)>\s?/,
  h2: /^##\s/,
};

/** 给选中的每一行加上（或去掉）列表、待办、引用、标题的前缀 */
export function linePrefixOp(text: string, s: number, e: number, kind: LineKind): EditOp {
  const start = lineStart(text, s);
  const end = lineEnd(text, e > s && text[e - 1] === "\n" ? e - 1 : e);
  const lines = text.slice(start, end).split("\n");
  const re = PREFIX_RE[kind];
  // 都是空行时算「还没有前缀」，点一下是加上
  const all = lines.some((l) => l.trim()) && lines.every((l) => !l.trim() || re.test(l));
  // 换成别的列表时，先去掉原来的前缀
  const strip = (l: string) =>
    l
      .replace(PREFIX_RE.task, "$1")
      .replace(PREFIX_RE.ul, "$1")
      .replace(PREFIX_RE.ol, "$1")
      .replace(PREFIX_RE.quote, "$1");
  let n = 0;
  const next = lines.map((l) => {
    if (all) return l.replace(re, "$1");
    if (!l.trim() && lines.length > 1) return l;
    const indent = l.match(/^\s*/)![0];
    const body = strip(l).slice(indent.length);
    n++;
    const prefix = { ul: "- ", ol: `${n}. `, task: "- [ ] ", quote: "> ", h2: "## " }[kind];
    return kind === "h2" ? prefix + body.replace(/^#+\s/, "") : indent + prefix + body;
  });
  const insert = next.join("\n");
  return { start, end, insert, selStart: start + insert.length, selEnd: start + insert.length };
}

/** 选中多行或包含换行时用代码块，否则用行内代码 */
export function codeOp(text: string, s: number, e: number): EditOp {
  const sel = text.slice(s, e);
  if (sel.includes("\n")) {
    const insert = "```\n" + sel.replace(/\n$/, "") + "\n```";
    return { start: s, end: e, insert, selStart: s + insert.length, selEnd: s + insert.length };
  }
  return wrapOp(text, s, e, "`", "`", "代码");
}

export function linkOp(text: string, s: number, e: number): EditOp {
  const sel = text.slice(s, e);
  if (/^https?:\/\/\S+$/.test(sel)) {
    const insert = `[链接文字](${sel})`;
    return { start: s, end: e, insert, selStart: s + 1, selEnd: s + 5 };
  }
  const label = sel || "链接文字";
  const insert = `[${label}](https://)`;
  const urlAt = s + label.length + 3;
  return { start: s, end: e, insert, selStart: urlAt, selEnd: urlAt + 8 };
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/;

/**
 * 在列表里按回车：自动接着写下一项（编号加一，待办接着是待办）；
 * 空的列表项按回车结束列表。不在列表里返回 null（按普通回车处理）
 */
export function enterOp(text: string, pos: number): EditOp | null {
  const start = lineStart(text, pos);
  const line = text.slice(start, lineEnd(text, pos));
  const m = line.match(LIST_RE);
  if (!m || pos < start + m[1].length + m[2].length + m[3].length) return null;
  const [, indent, marker, space, task, body] = m;
  if (!body.trim()) {
    // 空项：去掉这一行的前缀，结束列表；留一个空行，后面的文字才不会被算进列表
    const end = lineEnd(text, pos);
    const insert = `\n${indent}`;
    return { start, end, insert, selStart: start + insert.length, selEnd: start + insert.length };
  }
  const num = marker.match(/^(\d+)([.)])$/);
  const nextMarker = num ? `${Number(num[1]) + 1}${num[2]}` : marker;
  const insert = `\n${indent}${nextMarker}${space}${task ? "[ ] " : ""}`;
  return { start: pos, end: pos, insert, selStart: pos + insert.length, selEnd: pos + insert.length };
}

/** Tab / Shift+Tab：列表项缩进、取消缩进；不在列表里且只选了一行时返回 null（让焦点正常移动） */
export function indentOp(text: string, s: number, e: number, outdent: boolean): EditOp | null {
  const start = lineStart(text, s);
  const end = lineEnd(text, e);
  const block = text.slice(start, end);
  const lines = block.split("\n");
  if (lines.length === 1 && !LIST_RE.test(lines[0])) return null;
  const next = lines.map((l) => (outdent ? l.replace(/^ {1,2}|^\t/, "") : l ? "  " + l : l));
  const insert = next.join("\n");
  const firstDelta = next[0].length - lines[0].length;
  return { start, end, insert, selStart: Math.max(start, s + firstDelta), selEnd: e + (insert.length - block.length) };
}

// 和渲染时一样：引用里的、有序列表里的待办也算
const TASK_LINE = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=\s|$)/;

/** 把第 n 个待办（从 0 开始，代码块里的不算）打勾或取消，和渲染时的编号一致 */
export function toggleTask(text: string, n: number): string {
  let i = 0;
  let fence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      if (fence) return line;
      const m = line.match(TASK_LINE);
      if (!m) return line;
      if (i++ !== n) return line;
      return line.replace(TASK_LINE, `$1[${m[2] === " " ? "x" : " "}]`);
    })
    .join("\n");
}

/** 去掉 Markdown 标记，变成一行纯文字（列表、卡片的摘要里用） */
export function plainText(md: string): string {
  return refsToText(md)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}\s|>\s?|[-*+]\s(\[[ xX]\]\s)?|\d+[.)]\s)/gm, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
