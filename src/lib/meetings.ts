import { refsToText } from "./refs";

/**
 * 会议纪要：粘贴会议文字稿，挑出要点和待办；待办写在纪要里（- [ ] ），可以打勾，
 * 也可以一键变成工作记录或提醒事项。这里只有纯函数，浏览器和服务端都能用。
 */

export interface Meeting {
  id: number;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** 报工项目 */
  projectId: number | null;
  attendees: string;
  /** 会议文字稿原文（钉钉闪记、微信聊天记录等） */
  source: string;
  /** 纪要，Markdown */
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const NOTES_TEMPLATE = "## 要点\n- \n\n## 待办\n- [ ] ";

export interface MeetingTask {
  /** 第几个待办，和打勾时的编号一致 */
  index: number;
  text: string;
  done: boolean;
}

/** 纪要里的待办（代码块里的不算） */
export function parseTasks(notes: string): MeetingTask[] {
  const out: MeetingTask[] = [];
  let fence = false;
  for (const line of notes.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = line.match(/^(?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\](?:\s+(.*))?$/);
    if (m) out.push({ index: out.length, text: (m[2] ?? "").trim(), done: m[1] !== " " });
  }
  return out;
}

/** 把文字稿拆成一句一句，方便挑出要点和待办；去掉「发言人 1 00:12」之类的时间行 */
export function splitSentences(source: string): string[] {
  const out: string[] = [];
  for (const raw of source.split(/\n+/)) {
    const line = raw.trim();
    if (!line || /^(发言人|说话人|speaker)\s*\d*\s*[\d:：]*$/i.test(line) || /^\d{1,2}:\d{2}(:\d{2})?$/.test(line))
      continue;
    // 句号、问号、叹号、分号后断开，保留标点
    for (const part of line.split(/(?<=[。！？!?；;])/)) {
      const t = part.trim().replace(/^[，,、\s]+/, "");
      if (t.length >= 2) out.push(t);
    }
  }
  return out;
}

/** 待办类的小节（加进去的是「- [ ] 」） */
export const isTaskSection = (section: string) => /待办|行动|todo/i.test(section);

/** 往纪要的某一节末尾加一条；待办类的小节加成待办。没有这一节就在最后加上 */
export function appendToSection(notes: string, section: string, text: string): string {
  const item = isTaskSection(section) ? `- [ ] ${text}` : `- ${text}`;
  const lines = notes.split("\n");
  const head = lines.findIndex((l) => l.trim() === `## ${section}`);
  if (head < 0) return `${notes.replace(/\s+$/, "")}${notes.trim() ? "\n\n" : ""}## ${section}\n${item}`;
  // 这一节到下一个标题之前；先把模板里的空项（「- 」「- [ ] 」）替换掉
  let end = lines.findIndex((l, i) => i > head && /^#{1,6}\s/.test(l));
  if (end < 0) end = lines.length;
  const empty = lines.findIndex((l, i) => i > head && i < end && /^\s*-\s(\[ \]\s?)?$/.test(l));
  if (empty >= 0) {
    lines[empty] = item;
    return lines.join("\n");
  }
  let last = end - 1;
  while (last > head && !lines[last].trim()) last--;
  lines.splice(last + 1, 0, item);
  return lines.join("\n");
}

/* ---------- 复制 ---------- */

/** 行内的 Markdown 标记换成纯文字：引用只留标题，图片写成「[图片]」，链接写成「文字（网址）」 */
function inlinePlain(s: string): string {
  return refsToText(s)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[图片]")
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, "$1（$2）")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)/g, "");
}

/**
 * 复制成纯文本，直接发到微信、钉钉群里：小节写成【要点】，每节里的条目编号，
 * 待办用 ☐ / ☑，下级条目缩进
 */
export function meetingText(m: Meeting, projectName?: string): string {
  const head = [`【会议纪要】${m.title}`, `时间：${m.date}`];
  if (projectName) head.push(`项目：${projectName}`);
  if (m.attendees.trim()) head.push(`参会：${m.attendees.trim()}`);
  const out: string[] = [];
  let n = 0;
  let fence = false;
  for (const raw of m.notes.split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence) {
      out.push(raw);
      continue;
    }
    const heading = raw.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      n = 0;
      if (out.length && out[out.length - 1] !== "") out.push("");
      out.push(`【${inlinePlain(heading[1]).trim()}】`);
      continue;
    }
    const item = raw.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s*)?(.*)$/);
    if (item) {
      const [, indent, box, body] = item;
      if (!body.trim()) continue; // 模板里没填的空项
      const text = inlinePlain(body).trim();
      if (indent.length >= 2) out.push(`   · ${box !== undefined ? `${box === " " ? "☐" : "☑"} ` : ""}${text}`);
      else if (box !== undefined) out.push(`${box === " " ? "☐" : "☑"} ${text}`);
      else out.push(`${++n}. ${text}`);
      continue;
    }
    out.push(inlinePlain(raw));
  }
  // 去掉没有内容的小节
  const body = out
    .join("\n")
    .replace(/【[^】\n]*】\n*(?=【|$)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `${head.join("\n")}\n\n${body}`;
}

/** 保存前整理：去掉模板里没填的空项（「- 」「- [ ] 」），以及因此变空的小节 */
export function tidyNotes(notes: string): string {
  const lines = notes.split("\n").filter((l) => !/^\s*[-*+]\s*(\[[ xX]\])?\s*$/.test(l));
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      // 下一个非空行还是标题（或者到底了）：这一节是空的
      if (j >= lines.length || /^##?\s/.test(lines[j])) {
        i = j - 1;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 复制成 Markdown，贴到文档里；引用和站内图片换成文字（离开 MyDoc 就打不开了） */
export function meetingMarkdown(m: Meeting, projectName?: string): string {
  const meta = [`- 时间：${m.date}`];
  if (projectName) meta.push(`- 项目：${projectName}`);
  if (m.attendees.trim()) meta.push(`- 参会：${m.attendees.trim()}`);
  const notes = refsToText(tidyNotes(m.notes)).replace(/!\[([^\]]*)\]\(\/api\/attachments\/\d+\)/g, "[图片：$1]");
  return `# ${m.title}\n\n${meta.join("\n")}\n\n${notes.trim()}\n`;
}

/* ---------- 模板 ---------- */

export interface MeetingTemplate {
  id: string;
  name: string;
  notes: string;
  /** 自己存的模板（可以删） */
  custom?: boolean;
}

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  { id: "general", name: "通用", notes: "## 要点\n- \n\n## 结论\n- \n\n## 待办\n- [ ] " },
  { id: "weekly", name: "周会", notes: "## 上周进展\n- \n\n## 本周计划\n- \n\n## 问题与风险\n- \n\n## 待办\n- [ ] " },
  { id: "review", name: "评审会", notes: "## 评审内容\n- \n\n## 结论\n- \n\n## 遗留问题\n- \n\n## 待办\n- [ ] " },
  { id: "client", name: "客户沟通", notes: "## 客户诉求\n- \n\n## 我方答复\n- \n\n## 风险\n- \n\n## 待办\n- [ ] " },
  { id: "one", name: "一对一", notes: "## 近况\n- \n\n## 反馈\n- \n\n## 待办\n- [ ] " },
];

/** 纪要里的小节标题（从原文挑选时按这些分类） */
export function sectionsOf(notes: string): string[] {
  return [...notes.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]);
}

/** 只有模板、还没写内容（换模板时不用确认） */
export const isBlankNotes = (notes: string) =>
  !notes.split("\n").some((l) => l.trim() && !/^#{1,6}\s/.test(l) && !/^\s*[-*+]\s*(\[[ xX]\])?\s*$/.test(l));

/** 把写好的纪要变成模板：保留小节标题，每节留一个空项 */
export function toTemplate(notes: string): string {
  const sections = sectionsOf(notes);
  if (!sections.length) return "";
  return sections.map((s) => `## ${s}\n${isTaskSection(s) ? "- [ ] " : "- "}`).join("\n\n");
}

/* ---------- 待办的负责人和截止时间 ---------- */

export interface TaskMeta {
  owner?: string;
  /** YYYY-MM-DD */
  due?: string;
}

const WEEKDAY_INDEX: Record<string, number> = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };

const pad = (n: number) => String(n).padStart(2, "0");
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function monday(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** 从待办里认出截止日期（相对会议日期）：周五前、下周二、明天、11月20日、15号、月底、本周内 */
export function parseDue(text: string, meetingDate: string): string | undefined {
  const year = Number(meetingDate.slice(0, 4));
  let m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (m) {
    let d = `${year}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
    // 年底开会说「1 月 5 日」，是明年
    if (d < addDays(meetingDate, -180)) d = `${year + 1}${d.slice(4)}`;
    return d;
  }
  m = text.match(/下(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/);
  if (m) return addDays(monday(meetingDate), 7 + WEEKDAY_INDEX[m[1]]);
  m = text.match(/(?:本周|这周|周|星期|礼拜)([一二三四五六日天])/);
  if (m) {
    const d = addDays(monday(meetingDate), WEEKDAY_INDEX[m[1]]);
    return d < meetingDate ? addDays(d, 7) : d;
  }
  if (/今天|今日|会后马上/.test(text)) return meetingDate;
  if (/明天|明日/.test(text)) return addDays(meetingDate, 1);
  if (/后天/.test(text)) return addDays(meetingDate, 2);
  if (/(本周|这周)(内|之内)?/.test(text)) {
    const fri = addDays(monday(meetingDate), 4);
    return fri < meetingDate ? meetingDate : fri;
  }
  if (/下周(内|之内)?/.test(text)) return addDays(monday(meetingDate), 11);
  if (/月底/.test(text)) {
    const [y, mo] = meetingDate.split("-").map(Number);
    return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  }
  m = text.match(/(\d{1,2})\s*[号日]/);
  if (m) {
    let d = `${meetingDate.slice(0, 8)}${pad(Number(m[1]))}`;
    if (d < meetingDate) {
      const [y, mo] = meetingDate.split("-").map(Number);
      d = mo === 12 ? `${y + 1}-01-${pad(Number(m[1]))}` : `${y}-${pad(mo + 1)}-${pad(Number(m[1]))}`;
    }
    return d;
  }
  return undefined;
}

const TIME_WORD =
  "今天|今日|明天|明日|后天|下周|下个周|本周|这周|周[一二三四五六日天]|星期|礼拜|\\d{1,2}\\s*月|\\d{1,2}\\s*[号日]|月底";

/**
 * 认出负责人：@某人、「负责人：某人」、参会人名单里的人开头，
 * 或者句首两三个字后面紧跟着时间（「小林周五前…」「王工下周二前…」）
 */
export function parseOwner(text: string, attendees = ""): string | undefined {
  const at = text.match(/@([^\s@，,。；;：:]{1,10})/);
  if (at) return at[1];
  const lead = text.match(/负责人?[：:]\s*([^\s，,。；;]{1,10})/);
  if (lead) return lead[1];
  const names = attendees
    .split(/[、,，;；\s]+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "我");
  const named = names.find((n) => text.startsWith(n) || text.includes(`由${n}`));
  if (named) return named;
  const m = text.match(new RegExp(`^([\\u4e00-\\u9fa5]{2,3}?)(?=${TIME_WORD})`));
  return m?.[1];
}

export function parseTaskMeta(text: string, meetingDate: string, attendees = ""): TaskMeta {
  return { owner: parseOwner(text, attendees), due: parseDue(text, meetingDate) };
}

/* ---------- 上次会议的待办 ---------- */

/** 会议的「系列」：去掉日期、编号、括号里的内容，例如「知识库周会 10.14」「知识库周会（第 3 次）」都是「知识库周会」 */
export const meetingSeries = (title: string) =>
  title
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/第\s*\d+\s*[次期周]/g, "")
    .replace(/\d{1,4}\s*[年月日号.\-/]?/g, "")
    .replace(/[\s·\-—_:：]+/g, "")
    .toLowerCase();

/** 同一个系列、同一个项目，日期在这次之前的最近一次会议 */
export function previousMeeting(
  meetings: Meeting[],
  current: { id?: number; title: string; date: string; projectId: number | null },
): Meeting | undefined {
  const series = meetingSeries(current.title);
  if (!series) return undefined;
  return meetings
    .filter(
      (m) =>
        m.id !== current.id &&
        m.date <= current.date &&
        meetingSeries(m.title) === series &&
        (m.projectId === current.projectId || m.projectId === null || current.projectId === null),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
}

/** 上次会议还没完成、这次纪要里也还没有的待办 */
export function openTasksFrom(prev: Meeting | undefined, notes: string): MeetingTask[] {
  if (!prev) return [];
  const here = parseTasks(notes).map((t) => t.text);
  return parseTasks(prev.notes).filter((t) => !t.done && t.text && !here.includes(t.text));
}
