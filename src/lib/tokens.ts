import crypto from "node:crypto";
import type { DB } from "./db";
import { HttpError } from "./errors";

/** 访问令牌：给 AI 助手（MCP）等程序使用，数据库里只保存哈希 */
export interface ApiToken {
  id: number;
  name: string;
  /** 令牌开头几位，用来区分 */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export const MAX_TOKENS = 20;
const TOKEN_PREFIX = "mydoc_";

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

interface TokenRow {
  id: number;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

const toToken = (r: TokenRow): ApiToken => ({
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
});

export function listTokens(db: DB): ApiToken[] {
  return (
    db.prepare("SELECT id, name, prefix, created_at, last_used_at FROM api_tokens ORDER BY id").all() as TokenRow[]
  ).map(toToken);
}

/** 新建令牌；明文只在这里返回一次 */
export function createToken(db: DB, name: string): { token: string; info: ApiToken } {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM api_tokens").get() as { n: number }).n;
  if (count >= MAX_TOKENS) throw new HttpError(400, `最多只能创建 ${MAX_TOKENS} 个令牌，请先删除不用的`);
  const token = TOKEN_PREFIX + crypto.randomBytes(24).toString("base64url");
  const r = db
    .prepare("INSERT INTO api_tokens (name, token_hash, prefix, created_at) VALUES (?, ?, ?, ?)")
    .run(name, hash(token), token.slice(0, TOKEN_PREFIX.length + 4), new Date().toISOString());
  const row = db.prepare("SELECT * FROM api_tokens WHERE id = ?").get(r.lastInsertRowid) as TokenRow;
  return { token, info: toToken(row) };
}

export function deleteToken(db: DB, id: number): void {
  const r = db.prepare("DELETE FROM api_tokens WHERE id = ?").run(id);
  if (r.changes === 0) throw new HttpError(404, "令牌不存在");
}

/** 校验令牌，顺便记下最近使用时间（一分钟最多写一次） */
export function verifyToken(db: DB, token: string | null | undefined): boolean {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return false;
  const row = db.prepare("SELECT id, last_used_at FROM api_tokens WHERE token_hash = ?").get(hash(token)) as
    | { id: number; last_used_at: string | null }
    | undefined;
  if (!row) return false;
  const now = new Date();
  if (!row.last_used_at || now.getTime() - new Date(row.last_used_at).getTime() > 60_000) {
    db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(now.toISOString(), row.id);
  }
  return true;
}

/** 从 Authorization: Bearer xxx 里取出令牌 */
export function bearerToken(req: Request): string | null {
  const m = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)\s*$/i);
  return m ? m[1] : null;
}
