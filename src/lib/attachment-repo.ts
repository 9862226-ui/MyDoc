import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir, type DB } from "./db";
import { HttpError } from "./errors";

/** 单个附件最大 20MB */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** 刚上传、还没保存到内容里的附件（草稿里的），一天内不清理 */
const KEEP_NEW_MS = 24 * 3600 * 1000;

export interface Attachment {
  id: number;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  /** 相对附件目录的路径 */
  file: string;
  createdAt: string;
}

interface Row {
  id: number;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  file: string;
  created_at: string;
}

const toAttachment = (r: Row): Attachment => ({
  id: r.id,
  name: r.name,
  mime: r.mime,
  size: r.size,
  sha256: r.sha256,
  file: r.file,
  createdAt: r.created_at,
});

export const attachmentsDir = () => path.join(dataDir(), "attachments");

/** 附件的地址，正文里用 ![名字](/api/attachments/12) 引用 */
export const attachmentUrl = (id: number) => `/api/attachments/${id}`;
const URL_RE = /\/api\/attachments\/(\d+)/g;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const extOf = (name: string) => (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "").toLowerCase();

/** 文件名去掉路径和控制字符；粘贴的截图没有名字时起一个 */
export function cleanName(name: string, mime: string): string {
  const base = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  if (base && base !== "image.png") return base;
  const ext = Object.entries(MIME_BY_EXT).find(([, m]) => m === mime)?.[0] ?? "bin";
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `截图-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}.${ext}`;
}

export function guessMime(name: string, given: string): string {
  if (given && given !== "application/octet-stream") return given.split(";")[0].trim().toLowerCase();
  return MIME_BY_EXT[extOf(name)] ?? "application/octet-stream";
}

/** 存一个附件；同样内容的文件已经有了就直接用原来的 */
export function saveAttachment(db: DB, input: { name: string; mime: string; data: Buffer }): Attachment {
  if (!input.data.length) throw new HttpError(400, "文件是空的");
  if (input.data.length > MAX_ATTACHMENT_BYTES) throw new HttpError(413, "文件太大了（最大 20MB）");
  const sha256 = createHash("sha256").update(input.data).digest("hex");
  const existing = db.prepare("SELECT * FROM attachments WHERE sha256 = ?").get(sha256) as Row | undefined;
  const mime = guessMime(input.name, input.mime);
  const name = cleanName(input.name, mime);
  const ext = extOf(name);
  const file = existing?.file ?? `${sha256.slice(0, 2)}/${sha256}${ext ? `.${ext}` : ""}`;
  const full = path.join(attachmentsDir(), file);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, input.data);
  }
  if (existing) {
    // 又传了一次，说明正在用：重新计时，免得被当成没用的清理掉
    db.prepare("UPDATE attachments SET created_at = ? WHERE id = ?").run(new Date().toISOString(), existing.id);
    return getAttachment(db, existing.id)!;
  }
  const r = db
    .prepare("INSERT INTO attachments (name, mime, size, sha256, file, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(name, mime, input.data.length, sha256, file, new Date().toISOString());
  return getAttachment(db, Number(r.lastInsertRowid))!;
}

export function getAttachment(db: DB, id: number): Attachment | null {
  const r = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as Row | undefined;
  return r ? toAttachment(r) : null;
}

export function listAttachments(db: DB): Attachment[] {
  return (db.prepare("SELECT * FROM attachments ORDER BY id").all() as Row[]).map(toAttachment);
}

export function readAttachmentFile(a: Attachment): Buffer | null {
  try {
    return fs.readFileSync(path.join(attachmentsDir(), a.file));
  } catch {
    return null;
  }
}

/** 正文里用到的附件 id：工作记录明细、会议纪要、摘录、链接备注、提醒备注 */
export function usedAttachmentIds(db: DB): Set<number> {
  const used = new Set<number>();
  const scan = (sql: string) => {
    for (const r of db.prepare(sql).all() as { t: string }[]) {
      for (const m of r.t.matchAll(URL_RE)) used.add(Number(m[1]));
    }
  };
  const like = "LIKE '%/api/attachments/%'";
  scan(`SELECT detail t FROM work_logs WHERE detail ${like}`);
  scan(`SELECT notes t FROM meetings WHERE notes ${like}`);
  scan(`SELECT content t FROM snippets WHERE content ${like}`);
  scan(`SELECT note t FROM links WHERE note ${like}`);
  scan(`SELECT note t FROM reminders WHERE note ${like}`);
  return used;
}

export function attachmentStats(db: DB): { count: number; bytes: number; unused: number; unusedBytes: number } {
  const all = listAttachments(db);
  const used = usedAttachmentIds(db);
  const unused = all.filter((a) => !used.has(a.id));
  return {
    count: all.length,
    bytes: all.reduce((s, a) => s + a.size, 0),
    unused: unused.length,
    unusedBytes: unused.reduce((s, a) => s + a.size, 0),
  };
}

/** 删掉没有用到的附件（一天内新传的先留着，可能还在草稿里） */
export function cleanupAttachments(db: DB, now = Date.now()): { removed: number; bytes: number } {
  const used = usedAttachmentIds(db);
  let removed = 0;
  let bytes = 0;
  for (const a of listAttachments(db)) {
    if (used.has(a.id) || now - Date.parse(a.createdAt) < KEEP_NEW_MS) continue;
    db.prepare("DELETE FROM attachments WHERE id = ?").run(a.id);
    try {
      fs.unlinkSync(path.join(attachmentsDir(), a.file));
    } catch {
      // 文件已经不在了
    }
    removed++;
    bytes += a.size;
  }
  return { removed, bytes };
}
