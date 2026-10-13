import crypto from "node:crypto";
import type { DB } from "./db";
import { HttpError } from "./errors";
import { getAppData } from "./repo";
import type { Link } from "./types";
import { projectIndex } from "./view";

/** 把一个项目分享成只读链接：别人打开 /s/<token> 不用登录就能看到项目里的链接 */
export interface Share {
  id: number;
  projectId: number;
  projectName: string;
  token: string;
  hasPassword: boolean;
  showNotes: boolean;
  /** ISO 时间，null 表示永久有效 */
  expiresAt: string | null;
  expired: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
}

interface ShareRow {
  id: number;
  project_id: number;
  project_name: string;
  token: string;
  password_hash: string | null;
  show_notes: number;
  expires_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
}

const SELECT = "SELECT s.*, p.name AS project_name FROM shares s JOIN projects p ON p.id = s.project_id";

function toShare(r: ShareRow, now = new Date()): Share {
  return {
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    token: r.token,
    hasPassword: !!r.password_hash,
    showNotes: !!r.show_notes,
    expiresAt: r.expires_at,
    expired: !!r.expires_at && r.expires_at <= now.toISOString(),
    viewCount: r.view_count,
    lastViewedAt: r.last_viewed_at,
    createdAt: r.created_at,
  };
}

export function listShares(db: DB, projectId?: number): Share[] {
  const rows = (
    projectId === undefined
      ? db.prepare(`${SELECT} ORDER BY s.id DESC`).all()
      : db.prepare(`${SELECT} WHERE s.project_id = ? ORDER BY s.id DESC`).all(projectId)
  ) as ShareRow[];
  return rows.map((r) => toShare(r));
}

/* ---------- 密码 ---------- */

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  return `${salt.toString("hex")}:${crypto.scryptSync(password, salt, 32).toString("hex")}`;
}

export function checkPassword(hash: string, password: string): boolean {
  const [salt, expected] = hash.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, Buffer.from(salt, "hex"), 32);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

export interface ShareInput {
  projectId: number;
  /** 有效天数，null 表示永久 */
  days: number | null;
  password: string;
  showNotes: boolean;
}

export function createShare(db: DB, input: ShareInput, now = new Date()): Share {
  if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(input.projectId)) throw new HttpError(404, "项目不存在");
  const token = crypto.randomBytes(16).toString("base64url");
  const expires = input.days ? new Date(now.getTime() + input.days * 86400_000).toISOString() : null;
  const r = db
    .prepare(
      "INSERT INTO shares (project_id, token, password_hash, show_notes, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.projectId,
      token,
      input.password ? hashPassword(input.password) : null,
      Number(input.showNotes),
      expires,
      now.toISOString(),
    );
  return toShare(db.prepare(`${SELECT} WHERE s.id = ?`).get(r.lastInsertRowid) as ShareRow, now);
}

export function deleteShare(db: DB, id: number): void {
  if (db.prepare("DELETE FROM shares WHERE id = ?").run(id).changes === 0) throw new HttpError(404, "分享不存在");
}

/* ---------- 公开页面 ---------- */

interface ShareRecord {
  row: ShareRow;
  share: Share;
}

/** 按 token 找分享；不存在或已过期返回 null */
export function findShare(db: DB, token: string, now = new Date()): ShareRecord | null {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  const row = db.prepare(`${SELECT} WHERE s.token = ?`).get(token) as ShareRow | undefined;
  if (!row) return null;
  const share = toShare(row, now);
  return share.expired ? null : { row, share };
}

export const shareCookieName = (id: number) => `mydoc_share_${id}`;

/** 输对密码后发的 Cookie 值；改了密码（重新分享）后旧的自动失效 */
export function unlockValue(row: Pick<ShareRow, "token" | "password_hash">): string {
  return crypto
    .createHmac("sha256", row.password_hash ?? "")
    .update(row.token)
    .digest("base64url");
}

export function isUnlocked(row: ShareRow, cookieValue: string | undefined): boolean {
  if (!row.password_hash) return true;
  if (!cookieValue) return false;
  const expected = Buffer.from(unlockValue(row));
  const actual = Buffer.from(cookieValue);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export interface SharedLink {
  title: string;
  url: string;
  accessCode: string;
  expiresAt: string | null;
  note: string;
}

export interface SharedProject {
  projectId: number;
  projectName: string;
  groupName: string;
  description: string;
  updatedAt: string | null;
  links: SharedLink[];
}

/** 分享页看到的内容：只有这个项目的链接（不含回收站），不带访问次数等私人信息 */
export function sharedProject(db: DB, row: ShareRow): SharedProject {
  const data = getAppData(db);
  const info = projectIndex(data).get(row.project_id);
  const links = data.links
    .filter((l) => l.projectId === row.project_id)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title, "zh-CN"));
  const latest = links.reduce<string | null>((max, l) => (!max || l.updatedAt > max ? l.updatedAt : max), null);
  return {
    projectId: row.project_id,
    projectName: info?.project.name ?? row.project_name,
    groupName: info?.group?.name ?? "",
    description: info?.project.description ?? "",
    updatedAt: latest,
    links: links.map((l: Link) => ({
      title: l.title,
      url: l.url,
      accessCode: l.accessCode,
      expiresAt: l.expiresAt,
      note: row.show_notes ? l.note : "",
    })),
  };
}

export function recordShareView(db: DB, id: number): void {
  db.prepare("UPDATE shares SET view_count = view_count + 1, last_viewed_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
}
