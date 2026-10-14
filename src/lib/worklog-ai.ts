import { aiReady, chat, extractJson, getAiConfig, type AiConfig, type ChatMessage } from "./ai";
import type { DB } from "./db";
import { buildWeekly, shiftDate, weekdayLabel, weekStart, type WorkData, type WorkLog } from "./worklog";
import { getWorkWeek, setReportFields } from "./worklog-repo";

/** 让 AI 把零碎的工作记录整理成日报、周报里的总结 */

const RULES =
  "要求：书面、简洁，每条一行，用「1. 」「2. 」编号，尽量以动词开头；合并重复或零碎的条目；" +
  "只能根据记录来写，不要编造记录里没有的工作，不要加「圆满完成」之类的套话。";

function logLine(l: WorkLog, data: WorkData): string {
  const project = data.projects.find((p) => p.id === l.projectId)?.name;
  return `- ${project ? `[${project}] ` : ""}${l.content}${l.done ? "" : "（未完成）"}`;
}

export function buildDailyPrompt(data: WorkData, date: string): ChatMessage[] {
  const logs = data.logs.filter((l) => l.date === date);
  const part = (period: "am" | "pm") =>
    logs
      .filter((l) => l.period === period)
      .map((l) => logLine(l, data))
      .join("\n") || "（没有记录）";
  return [
    {
      role: "system",
      content:
        "你帮上班族写工作日报。根据当天的工作记录，分别写「上午总结」和「下午总结」。" +
        RULES +
        "只记了半天时，上午和下午都写全天的内容。" +
        '只输出 JSON：{"amSummary":"1. ...\\n2. ...","pmSummary":"1. ...\\n2. ..."}',
    },
    {
      role: "user",
      content: `日期：${date}（${weekdayLabel(date)}）\n\n上午：\n${part("am")}\n\n下午：\n${part("pm")}`,
    },
  ];
}

export function buildWeeklyPrompt(data: WorkData, date: string): ChatMessage[] {
  const start = weekStart(date);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDate(start, i);
    const logs = data.logs.filter((l) => l.date === d);
    if (logs.length) days.push(`${d}（${weekdayLabel(d)}）：\n${logs.map((l) => logLine(l, data)).join("\n")}`);
  }
  return [
    {
      role: "system",
      content:
        "你帮上班族写员工周报。根据这一周每天的工作记录，写「本周总结」和「下周计划」。" +
        RULES +
        "本周总结合并成 3~8 条，同一件事跨了几天的合成一条。" +
        "下周计划写 2~5 条：优先写标了「未完成」的事项，其余写本周工作自然的后续（如测试、上线、文档），不要凭空写新项目。" +
        '只输出 JSON：{"summary":"1. ...\\n2. ...","plan":"1. ...\\n2. ..."}',
    },
    { role: "user", content: days.join("\n\n") || "（这一周没有记录）" },
  ];
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** 整理并保存，返回整理后的字段 */
export async function polishReport(db: DB, kind: "daily" | "weekly", date: string, c: AiConfig = getAiConfig(db)) {
  if (!aiReady(c)) throw new Error("还没有配置 AI 模型，请先在「设置 › AI 模型」里填写");
  const data = getWorkWeek(db, date);
  if (kind === "daily") {
    if (!data.logs.some((l) => l.date === date)) throw new Error("这一天还没有工作记录");
    const raw = extractJson(await chat(c, buildDailyPrompt(data, date))) as Record<string, unknown>;
    const fields = { amSummary: text(raw.amSummary), pmSummary: text(raw.pmSummary) };
    if (!fields.amSummary && !fields.pmSummary) throw new Error("模型没有返回总结，请重试");
    return setReportFields(db, "daily", date, fields);
  }
  if (!buildWeekly(data, date).logCount) throw new Error("这一周还没有工作记录");
  const raw = extractJson(await chat(c, buildWeeklyPrompt(data, date))) as Record<string, unknown>;
  const fields = { summary: text(raw.summary), plan: text(raw.plan) };
  if (!fields.summary) throw new Error("模型没有返回总结，请重试");
  return setReportFields(db, "weekly", weekStart(date), fields);
}
