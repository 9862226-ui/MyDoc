import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { clearFailures, clientKey, lockedSeconds, recordFailure, shouldUseSecureCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { checkPassword, findShare, shareCookieName, unlockValue } from "@/lib/shares";

type Ctx = { params: Promise<{ token: string }> };

/** 分享页输入访问密码（不需要登录）；同一来源输错太多次会被暂时锁定 */
export const POST = route(
  async (req, ctx: Ctx) => {
    const { token } = await ctx.params;
    const found = findShare(getDb(), token);
    if (!found) throw new HttpError(404, "分享链接已失效");
    const { row } = found;
    if (!row.password_hash) return { ok: true };

    const key = `share:${row.id}:${clientKey(req)}`;
    const locked = lockedSeconds(key);
    if (locked) throw new HttpError(429, `尝试次数太多，请 ${Math.ceil(locked / 60)} 分钟后再试`);
    const { password } = await readJson(req, z.object({ password: z.string().max(200) }));
    if (!checkPassword(row.password_hash, password)) {
      const left = recordFailure(key);
      await new Promise((r) => setTimeout(r, 500));
      throw new HttpError(401, left > 0 ? `密码不正确，还可以再试 ${left} 次` : "密码不正确，尝试次数太多，请稍后再试");
    }
    clearFailures(key);

    const maxAge = row.expires_at
      ? Math.max(60, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000))
      : 30 * 86400;
    const cookie = [
      `${shareCookieName(row.id)}=${unlockValue(row)}`,
      `Path=/s/${token}`,
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAge}`,
      ...(shouldUseSecureCookie(req) ? ["Secure"] : []),
    ].join("; ");
    return Response.json({ ok: true }, { headers: { "set-cookie": cookie } });
  },
  { public: true },
);
