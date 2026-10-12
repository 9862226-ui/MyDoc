import { z } from "zod";
import { readJson, route } from "@/lib/api";
import {
  clearFailures,
  clientKey,
  createSession,
  isPasswordConfigured,
  lockedSeconds,
  recordFailure,
  SESSION_COOKIE,
  shouldUseSecureCookie,
  verifyPassword,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";

export const POST = route(
  async (req) => {
    if (!isPasswordConfigured()) throw new HttpError(500, "服务器没有设置登录密码（环境变量 APP_PASSWORD）");
    const key = clientKey(req);
    const locked = lockedSeconds(key);
    if (locked) throw new HttpError(429, `尝试次数太多，请 ${Math.ceil(locked / 60)} 分钟后再试`);

    const { password } = await readJson(req, z.object({ password: z.string().max(200) }));
    if (!verifyPassword(password)) {
      recordFailure(key);
      await new Promise((r) => setTimeout(r, 500));
      throw new HttpError(401, "密码不正确");
    }
    clearFailures(key);

    const { token, expires } = createSession(getDb());
    const res = Response.json({ ok: true });
    const cookie = [
      `${SESSION_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Expires=${expires.toUTCString()}`,
      shouldUseSecureCookie(req) ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    res.headers.append("Set-Cookie", cookie);
    return res;
  },
  { public: true },
);
