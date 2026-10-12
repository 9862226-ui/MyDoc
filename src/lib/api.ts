import { z } from "zod";
import { isAuthenticated } from "./auth";
import { HttpError } from "./errors";

/**
 * 包装路由处理函数：默认要求登录，统一处理错误。
 * 返回普通对象时自动转成 JSON。
 */
export function route<C>(
  fn: (req: Request, ctx: C) => unknown | Promise<unknown>,
  opts: { public?: boolean } = {},
): (req: Request, ctx: C) => Promise<Response> {
  return async (req, ctx) => {
    try {
      if (!opts.public && !(await isAuthenticated())) {
        return Response.json({ error: "未登录或登录已过期" }, { status: 401 });
      }
      const result = await fn(req, ctx);
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof z.ZodError) {
        const msg = e.issues[0]?.message ?? "参数错误";
        return Response.json({ error: msg }, { status: 400 });
      }
      console.error(e);
      return Response.json({ error: "服务器出错了" }, { status: 500 });
    }
  };
}

/** 读取并校验 JSON 请求体；要求 Content-Type 为 application/json，防止跨站表单提交 */
export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "请求格式不正确");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "请求格式不正确");
  }
  return schema.parse(body);
}

export async function idParam(ctx: { params: Promise<{ id: string }> }): Promise<number> {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "无效的 ID");
  return id;
}
