import { getDb } from "@/lib/db";
import { fetchTitle } from "@/lib/fetch-title";
import { handleBody, RPC } from "@/lib/mcp";
import { bearerToken, verifyToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/** 最大请求体，防止误传大文件 */
const MAX_BODY = 1024 * 1024;

const rpcError = (status: number, code: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers });

/** MCP 接口（Streamable HTTP，无状态）：用「设置 › AI 助手」里创建的访问令牌 */
export async function POST(req: Request) {
  if (!verifyToken(getDb(), bearerToken(req))) {
    return rpcError(401, -32001, "缺少或无效的访问令牌，请在 MyDoc「设置 › AI 助手（MCP）」里创建", {
      "www-authenticate": 'Bearer realm="MyDoc"',
    });
  }
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return rpcError(415, RPC.INVALID_REQUEST, "Content-Type 必须是 application/json");
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) return rpcError(413, RPC.INVALID_REQUEST, "请求太大了");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return rpcError(400, RPC.PARSE_ERROR, "Parse error");
  }
  const result = await handleBody({ db: getDb(), fetchTitle: (url) => fetchTitle(url, 6000) }, body);
  if (result === null) return new Response(null, { status: 202 });
  return Response.json(result);
}

/** 不提供服务端主动推送的事件流 */
export function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
