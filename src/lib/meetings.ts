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

/** 往纪要的某一节（「要点」或「待办」）末尾加一条；没有这一节就在最后加上 */
export function appendToSection(notes: string, section: "要点" | "待办", text: string): string {
  const item = section === "待办" ? `- [ ] ${text}` : `- ${text}`;
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

/** 复制成纯文本，发到群里 */
export function meetingText(m: Meeting, projectName?: string): string {
  const head = [`【会议纪要】${m.title}`, `时间：${m.date}`];
  if (projectName) head.push(`项目：${projectName}`);
  if (m.attendees.trim()) head.push(`参会：${m.attendees.trim()}`);
  const body = m.notes
    .replace(/^##\s+(.*)$/gm, "【$1】")
    .replace(/^(\s*[-*+]\s+)\[ \]\s*/gm, "$1☐ ")
    .replace(/^(\s*[-*+]\s+)\[[xX]\]\s*/gm, "$1☑ ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .trim();
  return `${head.join("\n")}\n\n${body}`;
}
