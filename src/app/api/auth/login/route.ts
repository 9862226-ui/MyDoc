import { z } from "zod";
import { readJson, route } from "@/lib/api";
import {
  clearFailures,
  clientKey,
  createSession,
  FAILURE_WINDOW_MINUTES,
  isPasswordConfigured,
  lockedSeconds,
  recordFailure,
  SESSION_COOKIE,
  SESSION_DAYS,
  SHORT_SESSION_DAYS,
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

    const { password, remember } = await readJson(
      req,
      z.object({ password: z.string().max(200), remember: z.boolean().default(true) }),
    );
    if (!verifyPassword(password)) {
      const left = recordFailure(key);
      await new Promise((r) => setTimeout(r, 500));
      throw new HttpError(
        401,
        left > 0
          ? `密码不正确，${FAILURE_WINDOW_MINUTES} 分钟内还可以再试 ${left} 次`
          : `密码不正确，尝试次数太多，请 ${FAILURE_WINDOW_MINUTES} 分钟后再试`,
      );
    }
    clearFailures(key);

    // 不勾选「30 天内免登录」时用会话 Cookie，关闭浏览器后失效
    const { token, expires } = createSession(getDb(), remember ? SESSION_DAYS : SHORT_SESSION_DAYS);
    const res = Response.json({ ok: true });
    const cookie = [
      `${SESSION_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      remember ? `Expires=${expires.toUTCString()}` : "",
      shouldUseSecureCookie(req) ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    res.headers.append("Set-Cookie", cookie);
    return res;
  },
  { public: true },
);
