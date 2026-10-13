import { z } from "zod";
import { HttpError } from "./errors";
import { TOOLS, ToolError, type ToolContext } from "./mcp-tools";

/**
 * MCP（Model Context Protocol）服务端，供 AI 助手调用。
 * 使用无状态的 Streamable HTTP：每个 POST 请求带一条或多条 JSON-RPC 消息，直接返回 JSON。
 */

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const SERVER_INFO = { name: "mydoc", title: "MyDoc", version: "1.0.0" };

const INSTRUCTIONS =
  "MyDoc 是用户自己的共享文档链接收藏夹：链接按「分组 / 项目」整理，可以带标签、提取码、备注和有效期；" +
  "另有提醒事项记录账号、域名、会员等的到期时间；摘录保存不是链接的文字片段（会议结论、账号说明、文章段落）。" +
  "找文档时先用 search_links；添加链接前可以用 list_projects 看看放进哪个项目合适，不确定时放进收件箱。";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

const rpcError = (id: JsonRpcResponse["id"], code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

function inputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

let toolList: unknown[] | null = null;

function listTools() {
  toolList ??= TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: inputSchema(t.input),
    ...(t.annotations ? { annotations: { title: t.title, ...t.annotations } } : {}),
  }));
  return { tools: toolList };
}

const text = (value: unknown) => [{ type: "text", text: JSON.stringify(value, null, 2) }];

async function callTool(ctx: ToolContext, params: Record<string, unknown> | undefined) {
  const name = params?.name;
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return null;
  const parsed = t.input.safeParse(params?.arguments ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}：` : "";
    return { content: text({ error: `参数不正确：${where}${issue?.message ?? ""}` }), isError: true };
  }
  try {
    const result = await t.run(ctx, parsed.data as never);
    return { content: text(result) };
  } catch (e) {
    if (e instanceof ToolError || e instanceof HttpError) {
      return { content: text({ error: e.message }), isError: true };
    }
    throw e;
  }
}

/** 处理一条 JSON-RPC 消息；通知和客户端发来的响应不需要回复，返回 null */
export async function handleMessage(ctx: ToolContext, msg: unknown): Promise<JsonRpcResponse | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return rpcError(null, RPC.INVALID_REQUEST, "Invalid Request");
  }
  const m = msg as JsonRpcRequest;
  if (typeof m.method !== "string") return null; // 客户端对我们请求的回复，忽略
  const isNotification = m.id === undefined;
  if (isNotification) return null;
  const id = m.id ?? null;
  if (m.jsonrpc !== "2.0") return rpcError(id, RPC.INVALID_REQUEST, "Invalid Request");

  try {
    switch (m.method) {
      case "initialize": {
        const requested = m.params?.protocolVersion;
        const protocolVersion =
          typeof requested === "string" && PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: INSTRUCTIONS,
          },
        };
      }
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return { jsonrpc: "2.0", id, result: listTools() };
      case "tools/call": {
        const result = await callTool(ctx, m.params);
        if (!result) return rpcError(id, RPC.INVALID_PARAMS, `Unknown tool: ${String(m.params?.name)}`);
        return { jsonrpc: "2.0", id, result };
      }
      case "resources/list":
        return { jsonrpc: "2.0", id, result: { resources: [] } };
      case "prompts/list":
        return { jsonrpc: "2.0", id, result: { prompts: [] } };
      default:
        return rpcError(id, RPC.METHOD_NOT_FOUND, `Method not found: ${m.method}`);
    }
  } catch (e) {
    console.error("MCP 处理出错", e);
    return rpcError(id, RPC.INTERNAL_ERROR, "服务器出错了");
  }
}

/** 处理一次 POST 的请求体（单条消息或批量），返回要回复的内容；全是通知时返回 null */
export async function handleBody(ctx: ToolContext, body: unknown): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return rpcError(null, RPC.INVALID_REQUEST, "Invalid Request");
    const out = (await Promise.all(body.map((m) => handleMessage(ctx, m)))).filter((r) => r !== null);
    return out.length ? out : null;
  }
  return handleMessage(ctx, body);
}
