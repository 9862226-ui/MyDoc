import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db";
import { handleMessage, type JsonRpcResponse } from "./mcp";
import * as repo from "./repo";
import { backupSchema, snippetCreateSchema } from "./schemas";
import * as sr from "./snippet-repo";
import { search, snippetMatches } from "./view";

let db: DB;
let pid: number;
const input = (patch: Partial<sr.SnippetInput> = {}): sr.SnippetInput => ({
  content: "周会结论：官网改版 11 月 20 日上线，设计稿周五前定稿",
  projectId: null,
  tags: [],
  sourceUrl: "",
  sourceTitle: "",
  pinned: false,
  ...patch,
});

beforeEach(() => {
  db = openDb(":memory:");
  const g = repo.createGroup(db, "工作");
  pid = repo.createProject(db, { groupId: g.id, name: "官网改版", description: "" }).id;
});

describe("摘录", () => {
  it("增删改，置顶的排在前面，删除项目后摘录还在", () => {
    const a = sr.createSnippet(db, input({ projectId: pid, tags: ["#会议", "会议"] }));
    expect(a.tags).toEqual(["会议"]);
    const b = sr.createSnippet(db, input({ content: "客户A 收货地址：上海市……" }));
    expect(sr.listSnippets(db).map((s) => s.id)).toEqual([b.id, a.id]);
    sr.updateSnippet(db, a.id, { pinned: true });
    expect(sr.listSnippets(db)[0].id).toBe(a.id);
    repo.deleteProject(db, pid);
    expect(sr.getSnippet(db, a.id).projectId).toBeNull();
    expect(sr.deleteSnippet(db, b.id).content).toContain("收货地址");
    expect(() => sr.getSnippet(db, b.id)).toThrow("摘录不存在");
  });

  it("全局搜索能搜到，支持拼音和项目名", () => {
    sr.createSnippet(db, input({ projectId: pid }));
    const data = repo.getAppData(db);
    expect(search(data, "上线").snippets).toHaveLength(1);
    expect(search(data, "zhjl").snippets).toHaveLength(1);
    expect(search(data, "gwgb").snippets).toHaveLength(1);
    expect(snippetMatches(data.snippets[0], data, "报价")).toBe(false);
  });

  it("校验：内容不能为空，来源链接要是网址", () => {
    expect(snippetCreateSchema.safeParse({ content: "  " }).success).toBe(false);
    expect(snippetCreateSchema.parse({ content: "x", sourceUrl: "example.com/a" }).sourceUrl).toBe(
      "https://example.com/a",
    );
    expect(snippetCreateSchema.safeParse({ content: "x", sourceUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("随 JSON 备份导出和恢复，按名称找回项目，重复恢复不会多出来", () => {
    sr.createSnippet(db, input({ projectId: pid, tags: ["会议"], sourceTitle: "周会纪要" }));
    const backup = backupSchema.parse(JSON.parse(JSON.stringify(repo.exportBackup(db))));
    const db2 = openDb(":memory:");
    expect(repo.importBackup(db2, backup).snippets).toBe(1);
    expect(repo.importBackup(db2, backup).snippets).toBe(0);
    const [s] = sr.listSnippets(db2);
    expect(s).toMatchObject({ tags: ["会议"], sourceTitle: "周会纪要" });
    expect(repo.getAppData(db2).projects.find((p) => p.id === s.projectId)?.name).toBe("官网改版");
  });

  it("MCP 可以添加和搜索摘录", async () => {
    const ctx = { db, fetchTitle: async () => "" };
    const call = async (name: string, args: object) => {
      const r = (await handleMessage(ctx, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      })) as JsonRpcResponse;
      return JSON.parse((r.result as { content: { text: string }[] }).content[0].text);
    };
    const added = await call("add_snippet", { content: "VPN 账号找 IT 小王开通", project: "官网改版" });
    expect(added).toMatchObject({ project: "工作 / 官网改版" });
    expect((await call("search_snippets", { query: "vpn" })).total).toBe(1);
  });
});
