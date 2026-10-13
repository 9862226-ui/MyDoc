import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db";
import { handleBody, handleMessage, RPC, type JsonRpcResponse } from "./mcp";
import * as repo from "./repo";
import { bearerToken, createToken, deleteToken, listTokens, verifyToken } from "./tokens";

let db: DB;
let fetched: string[];
const ctx = () => ({
  db,
  fetchTitle: async (url: string) => {
    fetched.push(url);
    return "自动获取的标题";
  },
});

let seq = 0;
async function call(name: string, args: Record<string, unknown> = {}) {
  const r = (await handleMessage(ctx(), {
    jsonrpc: "2.0",
    id: ++seq,
    method: "tools/call",
    params: { name, arguments: args },
  })) as JsonRpcResponse;
  const result = r.result as { content: { text: string }[]; isError?: boolean };
  return { data: JSON.parse(result.content[0].text), isError: !!result.isError };
}

beforeEach(() => {
  db = openDb(":memory:");
  fetched = [];
  const g = repo.createGroup(db, "工作");
  repo.createProject(db, { groupId: g.id, name: "官网改版", description: "" });
  const g2 = repo.createGroup(db, "个人");
  repo.createProject(db, { groupId: g2.id, name: "学习资料", description: "" });
});

describe("协议", () => {
  it("initialize 协商版本并声明工具能力", async () => {
    const r = await handleMessage(ctx(), {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    });
    expect(r?.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} } });
    const unknown = await handleMessage(ctx(), {
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    expect((unknown?.result as { protocolVersion: string }).protocolVersion).toBe("2025-11-25");
  });

  it("通知不回复，未知方法报错，批量请求逐条回复", async () => {
    expect(await handleMessage(ctx(), { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect((await handleMessage(ctx(), { jsonrpc: "2.0", id: 3, method: "nope" }))?.error?.code).toBe(
      RPC.METHOD_NOT_FOUND,
    );
    const batch = await handleBody(ctx(), [
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ]);
    expect(batch).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
    expect(await handleBody(ctx(), [{ jsonrpc: "2.0", method: "notifications/initialized" }])).toBeNull();
  });

  it("tools/list 给出 JSON Schema", async () => {
    const r = await handleMessage(ctx(), { jsonrpc: "2.0", id: 1, method: "tools/list" });
    const tools = (r?.result as { tools: { name: string; inputSchema: { type: string; properties: object } }[] }).tools;
    expect(tools.map((t) => t.name)).toContain("add_link");
    for (const t of tools) expect(t.inputSchema.type).toBe("object");
    expect(tools.find((t) => t.name === "add_link")!.inputSchema.properties).toHaveProperty("url");
  });

  it("未知工具是协议错误，参数错误返回给 AI 看", async () => {
    const r = await handleMessage(ctx(), {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "nope", arguments: {} },
    });
    expect(r?.error?.code).toBe(RPC.INVALID_PARAMS);
    const bad = await call("get_link", { id: "abc" });
    expect(bad.isError).toBe(true);
    expect(bad.data.error).toContain("参数不正确");
  });
});

describe("链接工具", () => {
  it("添加链接：自动获取标题、按名称找项目、不重复添加", async () => {
    const r = await call("add_link", { url: "https://a.feishu.cn/docx/1", project: "官网改版", tags: ["需求"] });
    expect(r.data).toMatchObject({ added: true, link: { title: "自动获取的标题", project: "工作 / 官网改版" } });
    expect(fetched).toEqual(["https://a.feishu.cn/docx/1"]);

    const dup = await call("add_link", { url: "https://a.feishu.cn/docx/1?from=copylink" });
    expect(dup.data).toMatchObject({ added: false, existing: { id: r.data.link.id } });
  });

  it("添加链接：分享文案自动拆出提取码", async () => {
    const r = await call("add_link", {
      url: "链接: https://pan.baidu.com/s/1abc 提取码: x7k2 --来自百度网盘超级会员v5的分享",
      project: "个人/学习资料",
    });
    expect(r.data.link).toMatchObject({
      url: "https://pan.baidu.com/s/1abc",
      accessCode: "x7k2",
      project: "个人 / 学习资料",
    });
  });

  it("找不到项目时提示怎么办", async () => {
    const r = await call("add_link", { url: "https://example.com", project: "不存在" });
    expect(r.isError).toBe(true);
    expect(r.data.error).toContain("list_projects");
  });

  it("搜索、修改、删除", async () => {
    const { data } = await call("add_link", { url: "https://docs.qq.com/sheet/2", title: "排期表 2026" });
    await call("add_link", { url: "https://example.com/x", title: "别的东西" });
    const found = await call("search_links", { query: "排期" });
    expect(found.data.links.map((l: { title: string }) => l.title)).toEqual(["排期表 2026"]);

    const updated = await call("update_link", {
      id: data.link.id,
      project: "工作/官网改版",
      access_code: "abcd",
      expires_at: "2026-12-31",
    });
    expect(updated.data).toMatchObject({ project: "工作 / 官网改版", accessCode: "abcd", expiresAt: "2026-12-31" });
    expect((await call("search_links", { project: "官网改版" })).data.total).toBe(1);

    expect((await call("delete_link", { id: data.link.id })).data.deleted).toBe(true);
    expect((await call("search_links", { query: "排期" })).data.total).toBe(0);
  });

  it("新建项目时自动建分组，已存在的直接返回", async () => {
    const a = await call("create_project", { group: "客户A", name: "合同" });
    expect(a.data).toMatchObject({ created: true, project: "客户A / 合同" });
    const b = await call("create_project", { group: "客户a", name: "合同" });
    expect(b.data).toMatchObject({ created: false, id: a.data.id });
    const list = await call("list_projects");
    expect(list.data.groups.map((g: { name: string }) => g.name)).toEqual(["工作", "个人", "客户A"]);
  });
});

describe("提醒工具", () => {
  it("添加、列出、完成", async () => {
    const r = await call("add_reminder", {
      title: "域名",
      due_date: "2020-01-01",
      repeat: "yearly",
      url: "aliyun.com",
    });
    expect(r.data).toMatchObject({ needsAttention: true, url: "https://aliyun.com/" });
    expect((await call("list_reminders", { status: "due" })).data.total).toBe(1);
    const done = await call("complete_reminder", { id: r.data.id });
    expect(done.data.dueDate).toBe("2021-01-01");
    expect((await call("delete_reminder", { id: r.data.id })).data.deleted).toBe(true);
    expect((await call("complete_reminder", { id: r.data.id })).isError).toBe(true);
  });
});

describe("访问令牌", () => {
  it("只保存哈希，删除后失效", () => {
    const { token, info } = createToken(db, "Claude");
    expect(token).toMatch(/^mydoc_/);
    expect(info.prefix).toBe(token.slice(0, 10));
    expect(verifyToken(db, token)).toBe(true);
    expect(listTokens(db)[0].lastUsedAt).not.toBeNull();
    expect(verifyToken(db, token + "x")).toBe(false);
    expect(verifyToken(db, null)).toBe(false);
    expect(JSON.stringify(db.prepare("SELECT * FROM api_tokens").all())).not.toContain(token);
    deleteToken(db, info.id);
    expect(verifyToken(db, token)).toBe(false);
  });

  it("从请求头取令牌", () => {
    const req = (h: string) => new Request("http://x", { headers: { authorization: h } });
    expect(bearerToken(req("Bearer mydoc_abc"))).toBe("mydoc_abc");
    expect(bearerToken(req("Basic xxx"))).toBeNull();
  });
});
