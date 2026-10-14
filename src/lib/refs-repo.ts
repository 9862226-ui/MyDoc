import type { DB } from "./db";
import { plainText } from "./md-edit";
import { syllables } from "./pinyin";
import { parseRefs, refKey, type RefSource, type RefTarget, type RefType } from "./refs";
import { pinyinMatch } from "./view";

const mmdd = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
const firstLine = (s: string) => plainText(s.split("\n").find((l) => l.trim()) ?? "").slice(0, 60);

/** 关键字都对上（文字或拼音） */
function matches(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.every((w) => lower.includes(w) || pinyinMatch(w, syllables(text)));
}

/**
 * 插入引用时可以选的内容：工作记录、会议纪要、摘录、链接。
 * 没有关键字时列出最近的工作记录和会议（接着之前的事时最常用）
 */
export function searchRefTargets(db: DB, q: string, limit = 20): RefTarget[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out: RefTarget[] = [];

  const projects = new Map(
    (db.prepare("SELECT id, name FROM work_projects").all() as { id: number; name: string }[]).map((p) => [
      p.id,
      p.name,
    ]),
  );
  const logs = db
    .prepare(`SELECT id, date, content, project_id FROM work_logs ORDER BY date DESC, id DESC LIMIT ?`)
    .all(words.length ? 2000 : 12) as { id: number; date: string; content: string; project_id: number | null }[];
  for (const l of logs) {
    if (words.length && !matches(l.content, words)) continue;
    const project = l.project_id === null ? "" : (projects.get(l.project_id) ?? "");
    out.push({
      type: "log",
      id: l.id,
      title: l.content,
      date: l.date,
      subtitle: ["工作记录", mmdd(l.date), project].filter(Boolean).join(" · "),
    });
  }

  const meetings = db
    .prepare("SELECT id, title, date FROM meetings ORDER BY date DESC, id DESC LIMIT ?")
    .all(words.length ? 500 : 4) as { id: number; title: string; date: string }[];
  for (const m of meetings) {
    if (words.length && !matches(m.title, words)) continue;
    out.push({ type: "meeting", id: m.id, title: m.title, date: m.date, subtitle: `会议纪要 · ${mmdd(m.date)}` });
  }

  if (words.length) {
    const snippets = db.prepare("SELECT id, content FROM snippets ORDER BY id DESC").all() as {
      id: number;
      content: string;
    }[];
    for (const s of snippets) {
      if (!matches(s.content, words)) continue;
      out.push({ type: "snippet", id: s.id, title: firstLine(s.content), subtitle: "摘录" });
    }
    const links = db
      .prepare("SELECT id, title, url FROM links WHERE deleted_at IS NULL ORDER BY updated_at DESC")
      .all() as { id: number; title: string; url: string }[];
    for (const l of links) {
      if (!matches(`${l.title}\n${l.url}`, words)) continue;
      out.push({ type: "link", id: l.id, title: l.title, subtitle: `链接 · ${l.url.replace(/^https?:\/\//, "")}` });
    }
  }
  return out.slice(0, limit);
}

/** 所有反向链接：被引用的内容（log:12）→ 引用了它的内容 */
export function backlinks(db: DB): Record<string, RefSource[]> {
  const out: Record<string, RefSource[]> = {};
  const add = (text: string, source: RefSource) => {
    for (const r of parseRefs(text)) {
      const key = refKey(r.type, r.id);
      if (r.type === source.type && r.id === source.id) continue;
      (out[key] ??= []).push(source);
    }
  };
  const has = "LIKE '%[[%'";
  for (const l of db.prepare(`SELECT id, date, content, detail FROM work_logs WHERE detail ${has}`).all() as {
    id: number;
    date: string;
    content: string;
    detail: string;
  }[]) {
    add(l.detail, { type: "log", id: l.id, title: l.content, date: l.date });
  }
  for (const m of db.prepare(`SELECT id, date, title, notes FROM meetings WHERE notes ${has}`).all() as {
    id: number;
    date: string;
    title: string;
    notes: string;
  }[]) {
    add(m.notes, { type: "meeting", id: m.id, title: m.title, date: m.date });
  }
  for (const s of db.prepare(`SELECT id, content FROM snippets WHERE content ${has}`).all() as {
    id: number;
    content: string;
  }[]) {
    add(s.content, { type: "snippet", id: s.id, title: firstLine(s.content) });
  }
  for (const l of db.prepare(`SELECT id, title, note FROM links WHERE deleted_at IS NULL AND note ${has}`).all() as {
    id: number;
    title: string;
    note: string;
  }[]) {
    add(l.note, { type: "link", id: l.id, title: l.title });
  }
  // 新的在前
  for (const list of Object.values(out)) list.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return out;
}

/** 引用指向的页面；内容已经删掉时返回 null */
export function resolveRef(db: DB, type: RefType, id: number): string | null {
  switch (type) {
    case "log": {
      const r = db.prepare("SELECT date FROM work_logs WHERE id = ?").get(id) as { date: string } | undefined;
      return r ? `/work?date=${r.date}&log=${id}` : null;
    }
    case "meeting":
      return db.prepare("SELECT 1 FROM meetings WHERE id = ?").get(id) ? `/meetings?id=${id}` : null;
    case "snippet":
      return db.prepare("SELECT 1 FROM snippets WHERE id = ?").get(id) ? `/snippets?id=${id}` : null;
    case "link": {
      const r = db.prepare("SELECT url FROM links WHERE id = ? AND deleted_at IS NULL").get(id) as
        | { url: string }
        | undefined;
      return r && /^https?:\/\//i.test(r.url) ? r.url : null;
    }
  }
}
