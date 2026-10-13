import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildClassifyPrompt,
  classifyLinks,
  DEFAULT_AI,
  extractJson,
  normalizeBaseUrl,
  parseSuggestions,
  testModel,
  type AiConfig,
} from "./ai";
import { openDb, type DB } from "./db";
import * as repo from "./repo";

let db: DB;
let ids: { site: number; archived: number; a: number; b: number };
const base = { note: "", accessCode: "", expiresAt: null, pinned: false, favorite: false, tags: [] as string[] };
const cfg: AiConfig = { ...DEFAULT_AI, apiKey: "sk-test" };

beforeEach(() => {
  db = openDb(":memory:");
  const g = repo.createGroup(db, "工作");
  const site = repo.createProject(db, { groupId: g.id, name: "官网改版", description: "2026 官网" }).id;
  const archived = repo.createProject(db, { groupId: g.id, name: "旧项目", description: "" }).id;
  repo.updateProject(db, archived, { archived: true });
  repo.createLink(db, {
    ...base,
    url: "https://a.feishu.cn/docx/1",
    title: "官网需求文档",
    projectId: site,
    tags: ["需求"],
  });
  const a = repo.createLink(db, {
    ...base,
    url: "https://a.feishu.cn/sheets/2",
    title: "官网排期表",
    projectId: null,
  }).id;
  const b = repo.createLink(db, {
    ...base,
    url: "https://pan.baidu.com/s/3",
    title: "旅行照片",
    projectId: null,
    accessCode: "x7k2",
    note: "去年国庆",
  }).id;
  ids = { site, archived, a, b };
});

afterEach(() => vi.unstubAllGlobals());

describe("工具函数", () => {
  it("接口地址统一格式", () => {
    expect(normalizeBaseUrl("https://api.deepseek.com/")).toBe("https://api.deepseek.com");
    expect(normalizeBaseUrl("https://x.com/v1/chat/completions")).toBe("https://x.com/v1");
  });

  it("从各种回复里取出 JSON", () => {
    expect(extractJson('{"results":[]}')).toEqual({ results: [] });
    expect(extractJson('好的：\n```json\n{"results":[1]}\n```')).toEqual({ results: [1] });
    expect(extractJson('<think>想一想 {不是这个}</think>结果是 {"results":[2]} 。')).toEqual({ results: [2] });
    expect(() => extractJson("不知道")).toThrow();
  });
});

describe("提示词", () => {
  it("包含项目、标签和待归类链接，不含归档项目和提取码", () => {
    const [system, user] = buildClassifyPrompt(repo.getAppData(db), [ids.a, ids.b], true);
    expect(system.content).toContain("只输出 JSON");
    const payload = JSON.parse(user.content);
    expect(payload.projects).toEqual([
      { id: ids.site, path: "工作 / 官网改版", description: "2026 官网", examples: ["官网需求文档"] },
    ]);
    expect(payload.tags).toEqual(["需求"]);
    expect(payload.links.map((l: { id: number }) => l.id).sort()).toEqual([ids.a, ids.b].sort());
    expect(user.content).not.toContain("x7k2");
    expect(user.content).toContain("去年国庆");
  });
});

describe("检查模型结果", () => {
  it("项目必须存在且没归档；标签对齐已有的大小写；不认识的链接丢掉", () => {
    const data = repo.getAppData(db);
    const raw = {
      results: [
        {
          id: ids.a,
          project: ids.site,
          tags: ["#需求", "排期", "这是一个特别特别特别长的标签名字"],
          reason: "官网相关",
        },
        { id: ids.b, project: ids.archived, tags: [], reason: "" },
        { id: 99999, project: ids.site, tags: [] },
      ],
    };
    const out = parseSuggestions(raw, data, [ids.a, ids.b], true);
    expect(out).toEqual([
      { id: ids.a, projectId: ids.site, project: "工作 / 官网改版", tags: ["需求", "排期"], reason: "官网相关" },
      { id: ids.b, projectId: null, project: "收件箱", tags: [], reason: "" },
    ]);
    expect(parseSuggestions(raw, data, [ids.a], false)[0].tags).toEqual(["需求"]);
  });
});

describe("调用模型", () => {
  it("按 OpenAI 兼容格式请求，返回建议", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("deepseek-flash");
      const content = JSON.stringify({
        results: [{ id: ids.a, project: ids.site, tags: ["排期"], reason: "官网排期" }],
      });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await classifyLinks(db, [ids.a], cfg);
    expect(out[0]).toMatchObject({ projectId: ids.site, tags: ["排期"] });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.deepseek.com/chat/completions");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).authorization).toBe("Bearer sk-test");
  });

  it("出错时给出看得懂的提示", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"error":{"message":"Authentication Fails"}}', { status: 401 }));
    await expect(testModel(cfg)).rejects.toThrow("API Key 不正确或没有权限（Authentication Fails）");
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 402 }));
    await expect(testModel(cfg)).rejects.toThrow("账户余额不足");
    await expect(classifyLinks(db, [ids.a], { ...cfg, apiKey: "" })).rejects.toThrow("还没有配置 AI 模型");
  });
});
