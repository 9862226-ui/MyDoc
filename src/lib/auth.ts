import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type DB } from "./db";

export const SESSION_COOKIE = "mydoc_session";
export const SESSION_DAYS = 30;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest();

export function isPasswordConfigured(): boolean {
  return !!process.env.APP_PASSWORD;
}

export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return crypto.timingSafeEqual(sha256(input), sha256(expected));
}

export function createSession(db: DB): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  db.prepare("INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)").run(
    sha256(token).toString("hex"),
    new Date().toISOString(),
    expires.toISOString(),
  );
  return { token, expires };
}

export function validateSession(db: DB, token: string | undefined): boolean {
  if (!token) return false;
  const row = db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").get(sha256(token).toString("hex")) as
    | { expires_at: string }
    | undefined;
  return !!row && row.expires_at > new Date().toISOString();
}

export function deleteSession(db: DB, token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token).toString("hex"));
}

export async function isAuthenticated(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSession(getDb(), token);
}

/** 是否给 Cookie 加 Secure；可用 COOKIE_SECURE=true/false 强制指定 */
export function shouldUseSecureCookie(req: Request): boolean {
  const env = process.env.COOKIE_SECURE;
  if (env === "true") return true;
  if (env === "false") return false;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? new URL(req.url).protocol.slice(0, -1);
  return proto === "https";
}

// ---------- 登录失败限制：同一来源 15 分钟内最多失败 10 次 ----------

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60_000;
const failures = new Map<string, { count: number; resetAt: number }>();

export function clientKey(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "direct"
  );
}

/** 被锁定时返回剩余秒数，否则返回 0 */
export function lockedSeconds(key: string): number {
  const entry = failures.get(key);
  if (!entry || entry.resetAt < Date.now()) return 0;
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
}

export function recordFailure(key: string): void {
  const entry = failures.get(key);
  if (!entry || entry.resetAt < Date.now()) failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  else entry.count++;
}

export function clearFailures(key: string): void {
  failures.delete(key);
}
