/**
 * AI 一键整理会议纪要：把会议文字稿按纪要模板的小节整理成要点和待办。
 * 只返回整理结果，不保存；编辑页里填进纪要，用户看过、改过再保存
 */
import { aiReady, chat, extractJson, getAiConfig, type AiConfig, type ChatMessage } from "./ai";
import type { DB } from "./db";
import { isTaskSection } from "./meetings";
import { weekdayLabel } from "./worklog";

/** 原文太长时模型容易超出上下文、也很慢，让用户分段整理 */
export const MAX_SOURCE = 40_000;
export const DEFAULT_SECTIONS = ["要点", "结论", "待办"];

export interface MeetingAiInput {
  title: string;
  date: string;
  attendees: string;
  source: string;
  /** 纪要模板里的小节，按顺序；没有时用「要点、结论、待办」 */
  sections: string[];
}

export function buildMeetingPrompt(input: MeetingAiInput): ChatMessage[] {
  const sections = input.sections.length ? input.sections : DEFAULT_SECTIONS;
  const shape = sections.map((s) => `"${s}":["..."]`).join(",");
  const tasks = sections.filter(isTaskSection);
  return [
    {
      role: "system",
      content:
        "你帮上班族把会议文字稿整理成会议纪要。文字稿来自语音转写，可能有口语、重复、错别字和「发言人 1」之类的标记。" +
        `按这些小节整理：${sections.map((s) => `「${s}」`).join("、")}。` +
        "要求：每条一句话，书面、简洁，合并重复的内容，去掉寒暄和口头禅；只能根据文字稿来写，不要编造没提到的内容；" +
        "数字、日期、人名、系统名照原文保留；某个小节没有内容就给空数组。" +
        (tasks.length
          ? `「${tasks.join("」「")}」里写会上明确要做的事：有负责人时以「@负责人 」开头，有截止时间时写上（例如「周五前」「11月20日前」），然后写做什么。`
          : "") +
        "如果没给会议标题，根据内容拟一个不超过 20 个字的标题。" +
        `只输出 JSON：{"title":"...","sections":{${shape}}}`,
    },
    {
      role: "user",
      content: [
        `会议标题：${input.title.trim() || "（没填）"}`,
        `日期：${input.date}（${weekdayLabel(input.date)}）`,
        input.attendees.trim() && `参会人：${input.attendees.trim()}`,
        "",
        "文字稿：",
        input.source.trim(),
      ]
        .filter((l) => l !== "")
        .join("\n"),
    },
  ];
}

const clean = (s: string) =>
  s
    // 去掉模型自己加的「- 」「1. 」「[ ] 」（「3.5 版本」这种不算编号）
    .replace(/^\s*(?:(?:[-*+•·]|\d+(?:[、)]|\.(?!\d))|\[[ xX]?\])\s*)+/, "")
    .replace(/\s+/g, " ")
    .trim();

/** 把模型返回的 JSON 拼成纪要：按小节顺序，待办类的写成「- [ ] 」；模型多给的小节放在后面 */
export function notesFromAi(raw: unknown, sections: string[]): { notes: string; title: string } {
  const obj = (raw && typeof raw === "object" ? raw : {}) as { title?: unknown; sections?: unknown };
  const got = (obj.sections && typeof obj.sections === "object" ? obj.sections : {}) as Record<string, unknown>;
  const wanted = sections.length ? sections : DEFAULT_SECTIONS;
  const order = [...wanted, ...Object.keys(got).filter((k) => !wanted.includes(k))];
  const blocks: string[] = [];
  for (const name of order) {
    const v = got[name];
    const items = (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [])
      .filter((x): x is string => typeof x === "string")
      .map(clean)
      .filter(Boolean);
    if (!items.length) continue;
    const prefix = isTaskSection(name) ? "- [ ] " : "- ";
    blocks.push(`## ${name}\n${items.map((i) => prefix + i).join("\n")}`);
  }
  const title = typeof obj.title === "string" ? obj.title.trim().slice(0, 40) : "";
  return { notes: blocks.join("\n\n"), title };
}

export async function organizeMeeting(
  db: DB,
  input: MeetingAiInput,
  c: AiConfig = getAiConfig(db),
): Promise<{ notes: string; title: string }> {
  if (!aiReady(c)) throw new Error("还没有配置 AI 模型，请先在「设置 › AI 模型」里填写");
  if (!input.source.trim()) throw new Error("先粘贴会议文字稿");
  if (input.source.length > MAX_SOURCE)
    throw new Error(`文字稿太长（${input.source.length} 字），一次最多整理 ${MAX_SOURCE} 字，可以分段整理`);
  // 长文字稿整理得慢，多等一会儿
  let reply: string;
  try {
    reply = await chat(c, buildMeetingPrompt(input), 180_000);
  } catch (e) {
    throw new Error(`AI 整理失败：${(e as Error).message}`);
  }
  const raw = extractJson(reply);
  const result = notesFromAi(raw, input.sections);
  if (!result.notes) throw new Error("模型没有整理出内容，请重试");
  return result;
}
