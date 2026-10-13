import { AI_PRESETS, type AiProvider } from "./ai-presets";
import type { DB } from "./db";
import { networkErrorMessage } from "./net-error";
import { platformLabel } from "./platforms";
import { getAppData, normalizeTags } from "./repo";
import { getSetting, setSetting } from "./settings";
import type { AppData } from "./types";
import { projectIndex, projectPathLabel } from "./view";

export interface AiConfig {
  provider: AiProvider;
  /** OpenAI 兼容接口地址，例如 https://api.deepseek.com */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 添加到收件箱的链接自动归类 */
  autoClassify: boolean;
  /** 允许 AI 新建标签；关闭时只用已有标签 */
  allowNewTags: boolean;
}

export const DEFAULT_AI: AiConfig = {
  provider: "deepseek",
  baseUrl: AI_PRESETS.deepseek.baseUrl,
  apiKey: "",
  model: "deepseek-flash",
  autoClassify: false,
  allowNewTags: true,
};

export const AI_SECRETS: (keyof AiConfig)[] = ["apiKey"];

const CONFIG_KEY = "ai";
export const getAiConfig = (db: DB) => getSetting(db, CONFIG_KEY, DEFAULT_AI);
export const setAiConfig = (db: DB, c: AiConfig) => setSetting(db, CONFIG_KEY, c);

/** 已经配好可以用了 */
export function aiReady(c: AiConfig): boolean {
  return !!c.baseUrl.trim() && !!c.model.trim() && (!!c.apiKey || !!AI_PRESETS[c.provider]?.noKey);
}

/* ---------- 调用模型 ---------- */

/** 统一成不带结尾斜杠、不带 /chat/completions 的地址 */
export function normalizeBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/, "");
}

function aiError(status: number, body: string): Error {
  let message = "";
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    message = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.message ?? "";
  } catch {
    message = body.slice(0, 200);
  }
  const hint =
    status === 401 || status === 403
      ? "API Key 不正确或没有权限"
      : status === 402
        ? "账户余额不足"
        : status === 404
          ? "接口地址或模型名不正确"
          : status === 429
            ? "调用太频繁或额度用完了，请稍后再试"
            : `模型服务返回 ${status}`;
  return new Error(message ? `${hint}（${message.slice(0, 150)}）` : hint);
}

async function request(c: AiConfig, path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  if (!/^https?:\/\/\S+$/i.test(normalizeBaseUrl(c.baseUrl))) throw new Error("请填写正确的接口地址");
  let res: Response;
  try {
    res = await fetch(normalizeBaseUrl(c.baseUrl) + path, {
      ...init,
      headers: { "content-type": "application/json", ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Error(networkErrorMessage(e));
  }
  const text = await res.text();
  if (!res.ok) throw aiError(res.status, text);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("模型服务返回的内容看不懂，请检查接口地址");
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(c: AiConfig, messages: ChatMessage[], timeoutMs = 90_000): Promise<string> {
  if (!c.model.trim()) throw new Error("请填写模型");
  const data = (await request(
    c,
    "/chat/completions",
    { method: "POST", body: JSON.stringify({ model: c.model.trim(), messages, temperature: 0.2, stream: false }) },
    timeoutMs,
  )) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("模型没有返回内容");
  return content;
}

/** 服务商提供的模型列表（OpenAI 兼容的 /models 接口；有的服务商不支持） */
export async function listModels(c: AiConfig): Promise<string[]> {
  const data = (await request(c, "/models", { method: "GET" }, 15_000)) as { data?: { id?: string }[] };
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string")
    .sort();
}

/** 测试连接：发一句话，看能不能收到回复 */
export async function testModel(c: AiConfig): Promise<{ reply: string; ms: number }> {
  const start = Date.now();
  const reply = await chat(c, [{ role: "user", content: "请只回复两个字：你好" }], 30_000);
  return { reply: reply.trim().slice(0, 50), ms: Date.now() - start };
}

/** 从模型回复里取出 JSON（有的模型会包在 ```json 代码块里，或者前后带说明文字） */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : cleaned;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("模型返回的不是 JSON");
  }
}

/* ---------- 自动归类 ---------- */

export interface Suggestion {
  id: number;
  /** null 表示 AI 拿不准，留在收件箱 */
  projectId: number | null;
  project: string;
  tags: string[];
  reason: string;
}

export const MAX_CLASSIFY = 50;
const EXAMPLES_PER_PROJECT = 5;

/** 给模型的提示词：项目列表（带几个已有链接做参考）、已有标签、要归类的链接 */
export function buildClassifyPrompt(data: AppData, ids: number[], allowNewTags: boolean): ChatMessage[] {
  const index = projectIndex(data);
  const projects = data.projects
    .filter((p) => !p.archived)
    .map((p) => {
      const examples = data.links
        .filter((l) => l.projectId === p.id)
        .slice(0, EXAMPLES_PER_PROJECT)
        .map((l) => l.title);
      return {
        id: p.id,
        path: projectPathLabel(index.get(p.id)),
        ...(p.description ? { description: p.description } : {}),
        ...(examples.length ? { examples } : {}),
      };
    });
  const wanted = new Set(ids);
  const links = data.links
    .filter((l) => wanted.has(l.id))
    .map((l) => ({
      id: l.id,
      title: l.title,
      url: l.url.slice(0, 300),
      platform: platformLabel(l.url),
      ...(l.note ? { note: l.note.slice(0, 300) } : {}),
      ...(l.tags.length ? { tags: l.tags } : {}),
    }));
  const system = [
    "你是帮用户整理文档链接的助手。用户把链接按「分组 / 项目」整理，并用标签标记。",
    "根据每个链接的标题、网址、平台和备注，判断它最适合放进哪个项目，并给出 0~3 个标签。",
    "规则：",
    "1. project 只能填项目列表里的 id；拿不准、或者没有合适的项目时填 null，不要硬塞。",
    allowNewTags
      ? "2. 标签优先用已有标签；确实需要时可以新建，新标签要简短（2~6 个字），不要和项目名重复。"
      : "2. 标签只能从已有标签里选，没有合适的就不加。",
    "3. reason 用一句话（不超过 20 个字）说明理由。",
    '只输出 JSON，格式：{"results":[{"id":链接id,"project":项目id或null,"tags":["标签"],"reason":"理由"}]}',
  ].join("\n");
  const user = JSON.stringify({ projects, tags: data.tags.map((t) => t.name), links });
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 检查模型给的结果：项目必须存在，标签整理干净；不认识的链接丢掉 */
export function parseSuggestions(raw: unknown, data: AppData, ids: number[], allowNewTags: boolean): Suggestion[] {
  const results = (raw as { results?: unknown })?.results;
  if (!Array.isArray(results)) throw new Error("模型返回的格式不对");
  const index = projectIndex(data);
  const existingTags = new Map(data.tags.map((t) => [t.name.toLowerCase(), t.name]));
  const wanted = new Set(ids);
  const seen = new Set<number>();
  const out: Suggestion[] = [];
  for (const r of results as Record<string, unknown>[]) {
    const id = Number(r?.id);
    if (!wanted.has(id) || seen.has(id)) continue;
    seen.add(id);
    const pid = r.project === null || r.project === undefined ? null : Number(r.project);
    const info = pid !== null && Number.isInteger(pid) ? index.get(pid) : undefined;
    const projectId = info && !info.project.archived ? info.project.id : null;
    const tags = normalizeTags(
      (Array.isArray(r.tags) ? r.tags : [])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.replace(/^#/, "").trim())
        .map((t) => existingTags.get(t.toLowerCase()) ?? (allowNewTags && t.length <= 12 ? t : ""))
        .filter(Boolean),
    ).slice(0, 3);
    out.push({
      id,
      projectId,
      project: projectId === null ? "收件箱" : projectPathLabel(info),
      tags,
      reason: typeof r.reason === "string" ? r.reason.slice(0, 60) : "",
    });
  }
  return out;
}

/** 让模型给这些链接出归类建议（不会修改数据） */
export async function classifyLinks(db: DB, ids: number[], c = getAiConfig(db)): Promise<Suggestion[]> {
  if (!aiReady(c)) throw new Error("还没有配置 AI 模型，请先在「设置 › AI 模型」里填写");
  const data = getAppData(db);
  const valid = ids.filter((id) => data.links.some((l) => l.id === id)).slice(0, MAX_CLASSIFY);
  if (!valid.length) return [];
  const reply = await chat(c, buildClassifyPrompt(data, valid, c.allowNewTags));
  return parseSuggestions(extractJson(reply), data, valid, c.allowNewTags);
}
