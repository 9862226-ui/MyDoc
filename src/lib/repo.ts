import type { DB } from "./db";
import { HttpError } from "./errors";
import { pinyinIndex } from "./pinyin";
import type { ImportRefs } from "./ref-remap";
import { createSnippet, listSnippets } from "./snippet-repo";
import { importReminders, listReminders, toBackupReminder, type BackupReminder } from "./reminder-repo";
import type { AppData, Group, Link, Project, Tag } from "./types";
import { urlKey } from "./url";

const TRASH_DAYS = 30;

const now = () => new Date().toISOString();

interface LinkRow {
  id: number;
  project_id: number | null;
  title: string;
  url: string;
  note: string;
  access_code: string;
  expires_at: string | null;
  pinned: number;
  favorite: number;
  visit_count: number;
  last_visited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  tags_json: string;
}

const LINK_SELECT = `
  SELECT l.*, (
    SELECT json_group_array(name) FROM (
      SELECT t.name FROM link_tags lt JOIN tags t ON t.id = lt.tag_id
      WHERE lt.link_id = l.id ORDER BY t.name
    )
  ) AS tags_json
  FROM links l`;

function toLink(r: LinkRow): Link {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    url: r.url,
    note: r.note,
    accessCode: r.access_code,
    expiresAt: r.expires_at,
    pinned: !!r.pinned,
    favorite: !!r.favorite,
    visitCount: r.visit_count,
    lastVisitedAt: r.last_visited_at,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    tags: JSON.parse(r.tags_json || "[]") as string[],
  };
}

interface ProjectRow {
  id: number;
  group_id: number;
  name: string;
  description: string;
  archived: number;
  sort: number;
}

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    groupId: r.group_id,
    name: r.name,
    description: r.description,
    archived: !!r.archived,
    sort: r.sort,
  };
}

// ---------- 读取 ----------

export function getAppData(db: DB): AppData {
  const groups = db.prepare("SELECT id, name, sort FROM link_groups ORDER BY sort, id").all() as Group[];
  const projects = (db.prepare("SELECT * FROM projects ORDER BY sort, id").all() as ProjectRow[]).map(toProject);
  const tags = db.prepare("SELECT id, name FROM tags ORDER BY name").all() as Tag[];
  const links = (db.prepare(`${LINK_SELECT} WHERE l.deleted_at IS NULL ORDER BY l.id DESC`).all() as LinkRow[]).map(
    toLink,
  );
  // 拼音用于搜索，例如输入 pqb 或 paiqi 能找到「排期表」
  for (const g of groups) g.py = pinyinIndex(g.name);
  for (const p of projects) p.py = pinyinIndex(p.name);
  for (const l of links) l.py = pinyinIndex(l.title, ...l.tags);
  const snippets = listSnippets(db);
  for (const s of snippets) s.py = pinyinIndex(s.content.slice(0, 200), s.sourceTitle, ...s.tags);
  return { groups, projects, tags, links, reminders: listReminders(db), snippets };
}

export function getLink(db: DB, id: number): Link {
  const row = db.prepare(`${LINK_SELECT} WHERE l.id = ?`).get(id) as LinkRow | undefined;
  if (!row) throw new HttpError(404, "链接不存在");
  return toLink(row);
}

export function getTrash(db: DB): Link[] {
  purgeOldTrash(db);
  return (
    db.prepare(`${LINK_SELECT} WHERE l.deleted_at IS NOT NULL ORDER BY l.deleted_at DESC`).all() as LinkRow[]
  ).map(toLink);
}

export function purgeOldTrash(db: DB, days = TRASH_DAYS): void {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  db.prepare("DELETE FROM links WHERE deleted_at IS NOT NULL AND deleted_at < ?").run(cutoff);
}

// ---------- 分组 ----------

function nextSort(db: DB, table: "link_groups" | "projects", where = "", ...params: unknown[]): number {
  const row = db.prepare(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM ${table} ${where}`).get(...params) as {
    s: number;
  };
  return row.s;
}

export function createGroup(db: DB, name: string): Group {
  const t = now();
  const sort = nextSort(db, "link_groups");
  const r = db
    .prepare("INSERT INTO link_groups (name, sort, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(name, sort, t, t);
  return { id: Number(r.lastInsertRowid), name, sort };
}

function assertGroup(db: DB, id: number): void {
  if (!db.prepare("SELECT 1 FROM link_groups WHERE id = ?").get(id)) throw new HttpError(404, "分组不存在");
}

export function updateGroup(db: DB, id: number, name: string): void {
  assertGroup(db, id);
  db.prepare("UPDATE link_groups SET name = ?, updated_at = ? WHERE id = ?").run(name, now(), id);
}

/** 删除分组和其中的项目，项目里的链接会回到收件箱 */
export function deleteGroup(db: DB, id: number): void {
  assertGroup(db, id);
  db.prepare("DELETE FROM link_groups WHERE id = ?").run(id);
}

export function reorderGroups(db: DB, ids: number[]): void {
  const stmt = db.prepare("UPDATE link_groups SET sort = ? WHERE id = ?");
  db.transaction(() => ids.forEach((id, i) => stmt.run(i, id)))();
}

// ---------- 项目 ----------

export interface ProjectInput {
  groupId: number;
  name: string;
  description?: string;
}

function assertProject(db: DB, id: number): void {
  if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(id)) throw new HttpError(400, "项目不存在");
}

export function createProject(db: DB, input: ProjectInput): Project {
  assertGroup(db, input.groupId);
  const t = now();
  const sort = nextSort(db, "projects", "WHERE group_id = ?", input.groupId);
  const r = db
    .prepare(
      "INSERT INTO projects (group_id, name, description, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(input.groupId, input.name, input.description ?? "", sort, t, t);
  return {
    id: Number(r.lastInsertRowid),
    groupId: input.groupId,
    name: input.name,
    description: input.description ?? "",
    archived: false,
    sort,
  };
}

export interface ProjectPatch {
  groupId?: number;
  name?: string;
  description?: string;
  archived?: boolean;
}

export function updateProject(db: DB, id: number, patch: ProjectPatch): void {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  if (!row) throw new HttpError(404, "项目不存在");
  let sort = row.sort;
  if (patch.groupId !== undefined && patch.groupId !== row.group_id) {
    assertGroup(db, patch.groupId);
    sort = nextSort(db, "projects", "WHERE group_id = ?", patch.groupId);
  }
  db.prepare(
    "UPDATE projects SET group_id = ?, name = ?, description = ?, archived = ?, sort = ?, updated_at = ? WHERE id = ?",
  ).run(
    patch.groupId ?? row.group_id,
    patch.name ?? row.name,
    patch.description ?? row.description,
    patch.archived === undefined ? row.archived : Number(patch.archived),
    sort,
    now(),
    id,
  );
}

/** 删除项目，其中的链接回到收件箱 */
export function deleteProject(db: DB, id: number): void {
  if (!db.prepare("DELETE FROM projects WHERE id = ?").run(id).changes) throw new HttpError(404, "项目不存在");
}

/** 按给定顺序排列分组内的项目（也用于把项目拖到别的分组） */
export function reorderProjects(db: DB, groupId: number, ids: number[]): void {
  assertGroup(db, groupId);
  const stmt = db.prepare("UPDATE projects SET group_id = ?, sort = ? WHERE id = ?");
  db.transaction(() => ids.forEach((id, i) => stmt.run(groupId, i, id)))();
}

// ---------- 标签 ----------

export function normalizeTags(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, 30);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

function tagIds(db: DB, names: string[]): number[] {
  const insert = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  const select = db.prepare("SELECT id FROM tags WHERE name = ?");
  return normalizeTags(names).map((name) => {
    insert.run(name);
    return (select.get(name) as { id: number }).id;
  });
}

function setLinkTags(db: DB, linkId: number, names: string[]): void {
  db.prepare("DELETE FROM link_tags WHERE link_id = ?").run(linkId);
  addLinkTags(db, [linkId], names);
}

function addLinkTags(db: DB, linkIds: number[], names: string[]): void {
  const ids = tagIds(db, names);
  const stmt = db.prepare("INSERT OR IGNORE INTO link_tags (link_id, tag_id) VALUES (?, ?)");
  for (const linkId of linkIds) for (const tagId of ids) stmt.run(linkId, tagId);
}

/** 重命名标签；新名字已存在时合并到已有标签 */
export function renameTag(db: DB, id: number, name: string): void {
  const [clean] = normalizeTags([name]);
  if (!clean) throw new HttpError(400, "标签名不能为空");
  db.transaction(() => {
    const existing = db.prepare("SELECT id FROM tags WHERE name = ? AND id != ?").get(clean, id) as
      | { id: number }
      | undefined;
    if (existing) {
      db.prepare(
        "INSERT OR IGNORE INTO link_tags (link_id, tag_id) SELECT link_id, ? FROM link_tags WHERE tag_id = ?",
      ).run(existing.id, id);
      db.prepare("DELETE FROM tags WHERE id = ?").run(id);
    } else if (!db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(clean, id).changes) {
      throw new HttpError(404, "标签不存在");
    }
  })();
}

export function deleteTag(db: DB, id: number): void {
  db.prepare("DELETE FROM tags WHERE id = ?").run(id);
}

// ---------- 链接 ----------

export interface LinkInput {
  url: string;
  title: string;
  projectId: number | null;
  note: string;
  accessCode: string;
  expiresAt: string | null;
  pinned: boolean;
  favorite: boolean;
  tags: string[];
}

export function createLink(db: DB, input: LinkInput): Link {
  if (input.projectId !== null) assertProject(db, input.projectId);
  const t = now();
  const id = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO links (project_id, title, url, note, access_code, expires_at, pinned, favorite, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.projectId,
        input.title,
        input.url,
        input.note,
        input.accessCode,
        input.expiresAt,
        Number(input.pinned),
        Number(input.favorite),
        t,
        t,
      );
    const linkId = Number(r.lastInsertRowid);
    setLinkTags(db, linkId, input.tags);
    return linkId;
  })();
  return getLink(db, id);
}

export function updateLink(db: DB, id: number, patch: Partial<LinkInput>): Link {
  const cur = getLink(db, id);
  if (patch.projectId !== undefined && patch.projectId !== null) assertProject(db, patch.projectId);
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next = { ...cur, ...defined };
  db.transaction(() => {
    db.prepare(
      `UPDATE links SET project_id = ?, title = ?, url = ?, note = ?, access_code = ?, expires_at = ?,
       pinned = ?, favorite = ?, updated_at = ? WHERE id = ?`,
    ).run(
      next.projectId,
      next.title,
      next.url,
      next.note,
      next.accessCode,
      next.expiresAt,
      Number(next.pinned),
      Number(next.favorite),
      now(),
      id,
    );
    if (patch.tags) setLinkTags(db, id, patch.tags);
  })();
  return getLink(db, id);
}

export function recordVisit(db: DB, id: number): void {
  db.prepare("UPDATE links SET visit_count = visit_count + 1, last_visited_at = ? WHERE id = ?").run(now(), id);
}

export type BatchAction =
  | { action: "move"; projectId: number | null }
  | { action: "addTags"; tags: string[] }
  | { action: "removeTag"; tag: string }
  | { action: "favorite"; value: boolean }
  | { action: "pin"; value: boolean }
  | { action: "delete" }
  | { action: "restore" }
  | { action: "purge" };

export function batchLinks(db: DB, ids: number[], op: BatchAction): void {
  if (ids.length === 0) return;
  const t = now();
  const placeholders = ids.map(() => "?").join(",");
  const where = `id IN (${placeholders})`;
  db.transaction(() => {
    switch (op.action) {
      case "move":
        if (op.projectId !== null) assertProject(db, op.projectId);
        db.prepare(`UPDATE links SET project_id = ?, updated_at = ? WHERE ${where}`).run(op.projectId, t, ...ids);
        break;
      case "addTags":
        addLinkTags(db, ids, op.tags);
        db.prepare(`UPDATE links SET updated_at = ? WHERE ${where}`).run(t, ...ids);
        break;
      case "removeTag":
        db.prepare(
          `DELETE FROM link_tags WHERE link_id IN (${placeholders}) AND tag_id = (SELECT id FROM tags WHERE name = ?)`,
        ).run(...ids, op.tag);
        break;
      case "favorite":
        db.prepare(`UPDATE links SET favorite = ? WHERE ${where}`).run(Number(op.value), ...ids);
        break;
      case "pin":
        db.prepare(`UPDATE links SET pinned = ? WHERE ${where}`).run(Number(op.value), ...ids);
        break;
      case "delete":
        db.prepare(`UPDATE links SET deleted_at = ? WHERE deleted_at IS NULL AND ${where}`).run(t, ...ids);
        break;
      case "restore":
        db.prepare(`UPDATE links SET deleted_at = NULL WHERE ${where}`).run(...ids);
        break;
      case "purge":
        db.prepare(`DELETE FROM links WHERE deleted_at IS NOT NULL AND ${where}`).run(...ids);
        break;
    }
  })();
}

export function emptyTrash(db: DB): void {
  db.prepare("DELETE FROM links WHERE deleted_at IS NOT NULL").run();
}

// ---------- 导入导出 ----------

export interface ImportItem {
  url: string;
  title: string;
  accessCode?: string;
  note?: string;
  tags?: string[];
}

/** 批量导入链接，跳过已存在的链接，返回导入数量 */
export function importLinks(
  db: DB,
  items: ImportItem[],
  opts: { projectId: number | null; tags: string[] },
): { imported: number; skipped: number } {
  if (opts.projectId !== null) assertProject(db, opts.projectId);
  const existing = new Set(
    (db.prepare("SELECT url FROM links WHERE deleted_at IS NULL").all() as { url: string }[]).map((r) => urlKey(r.url)),
  );
  let imported = 0;
  let skipped = 0;
  db.transaction(() => {
    for (const item of items) {
      const key = urlKey(item.url);
      if (existing.has(key)) {
        skipped++;
        continue;
      }
      existing.add(key);
      createLink(db, {
        url: item.url,
        title: item.title,
        projectId: opts.projectId,
        note: item.note ?? "",
        accessCode: item.accessCode ?? "",
        expiresAt: null,
        pinned: false,
        favorite: false,
        tags: [...opts.tags, ...(item.tags ?? [])],
      });
      imported++;
    }
  })();
  return { imported, skipped };
}

export interface BackupLink {
  /** 原来的编号（恢复时把引用 [[link:12]] 换成新编号；旧版本的备份没有） */
  id?: number;
  title: string;
  url: string;
  note: string;
  accessCode: string;
  expiresAt: string | null;
  pinned: boolean;
  favorite: boolean;
  visitCount: number;
  lastVisitedAt: string | null;
  createdAt: string;
  tags: string[];
}

export interface Backup {
  app: "mydoc";
  version: 1;
  exportedAt: string;
  groups: { name: string; projects: { name: string; description: string; archived: boolean; links: BackupLink[] }[] }[];
  inbox: BackupLink[];
  reminders?: BackupReminder[];
  snippets?: BackupSnippet[];
}

function toBackupLink(l: Link): BackupLink {
  return {
    id: l.id,
    title: l.title,
    url: l.url,
    note: l.note,
    accessCode: l.accessCode,
    expiresAt: l.expiresAt,
    pinned: l.pinned,
    favorite: l.favorite,
    visitCount: l.visitCount,
    lastVisitedAt: l.lastVisitedAt,
    createdAt: l.createdAt,
    tags: l.tags,
  };
}

export function exportBackup(db: DB): Backup {
  const data = getAppData(db);
  const linksOf = (projectId: number | null) =>
    data.links
      .filter((l) => l.projectId === projectId)
      .sort((a, b) => a.id - b.id)
      .map(toBackupLink);
  return {
    app: "mydoc",
    version: 1,
    exportedAt: now(),
    groups: data.groups.map((g) => ({
      name: g.name,
      projects: data.projects
        .filter((p) => p.groupId === g.id)
        .map((p) => ({ name: p.name, description: p.description, archived: p.archived, links: linksOf(p.id) })),
    })),
    inbox: linksOf(null),
    reminders: data.reminders.map(toBackupReminder),
    snippets: data.snippets.map((s) => {
      const p = data.projects.find((x) => x.id === s.projectId);
      const g = p && data.groups.find((x) => x.id === p.groupId);
      return {
        id: s.id,
        content: s.content,
        group: g?.name ?? null,
        project: p?.name ?? null,
        tags: s.tags,
        sourceUrl: s.sourceUrl,
        sourceTitle: s.sourceTitle,
        pinned: s.pinned,
        createdAt: s.createdAt,
      };
    }),
  };
}

/** 从备份恢复：按名称合并分组和项目，已存在的链接跳过 */
export interface BackupSnippet {
  id?: number;
  content: string;
  /** 所在的分组和项目名称，恢复时按名称找项目 */
  group: string | null;
  project: string | null;
  tags: string[];
  sourceUrl: string;
  sourceTitle: string;
  pinned: boolean;
  createdAt: string;
}

/** 从备份恢复摘录：内容完全相同的跳过 */
function importSnippets(db: DB, list: BackupSnippet[], refs?: ImportRefs): number {
  const exists = db.prepare("SELECT id FROM snippets WHERE content = ?");
  const findProject = db.prepare(
    "SELECT p.id FROM projects p JOIN link_groups g ON g.id = p.group_id WHERE g.name = ? AND p.name = ?",
  );
  let added = 0;
  for (const s of list) {
    if (!s.content.trim()) continue;
    const same = exists.get(s.content) as { id: number } | undefined;
    if (same) {
      refs?.add("snippet", s.id, same.id, false);
      continue;
    }
    const found =
      s.group && s.project ? (findProject.get(s.group, s.project) as { id: number } | undefined) : undefined;
    const created = createSnippet(
      db,
      {
        content: s.content,
        projectId: found?.id ?? null,
        tags: s.tags,
        sourceUrl: s.sourceUrl,
        sourceTitle: s.sourceTitle,
        pinned: s.pinned,
      },
      s.createdAt,
    );
    refs?.add("snippet", s.id, created.id, true);
    added++;
  }
  return added;
}

export function importBackup(
  db: DB,
  backup: Backup,
  refs?: ImportRefs,
): { imported: number; skipped: number; reminders: number; snippets: number } {
  // 已有的链接：网址 → 编号（跳过时把引用对应到已有的这条）
  const existing = new Map(
    (db.prepare("SELECT id, url FROM links WHERE deleted_at IS NULL").all() as { id: number; url: string }[]).map(
      (r) => [urlKey(r.url), r.id],
    ),
  );
  let imported = 0;
  let skipped = 0;
  let reminders = 0;
  let snippets = 0;
  const insert = db.prepare(
    `INSERT INTO links (project_id, title, url, note, access_code, expires_at, pinned, favorite, visit_count,
       last_visited_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const addLinks = (projectId: number | null, links: BackupLink[]) => {
    for (const l of links) {
      const key = urlKey(l.url);
      const same = existing.get(key);
      if (same !== undefined) {
        refs?.add("link", l.id, same, false);
        skipped++;
        continue;
      }
      const r = insert.run(
        projectId,
        l.title,
        l.url,
        l.note,
        l.accessCode,
        l.expiresAt,
        Number(l.pinned),
        Number(l.favorite),
        l.visitCount,
        l.lastVisitedAt,
        l.createdAt,
        now(),
      );
      const newId = Number(r.lastInsertRowid);
      existing.set(key, newId);
      refs?.add("link", l.id, newId, true);
      setLinkTags(db, newId, l.tags);
      imported++;
    }
  };

  db.transaction(() => {
    for (const g of backup.groups) {
      const found = db.prepare("SELECT id FROM link_groups WHERE name = ?").get(g.name) as { id: number } | undefined;
      const groupId = found?.id ?? createGroup(db, g.name).id;
      for (const p of g.projects) {
        const foundProject = db
          .prepare("SELECT id FROM projects WHERE group_id = ? AND name = ?")
          .get(groupId, p.name) as { id: number } | undefined;
        let projectId = foundProject?.id;
        if (!projectId) {
          projectId = createProject(db, { groupId, name: p.name, description: p.description }).id;
          if (p.archived) updateProject(db, projectId, { archived: true });
        }
        addLinks(projectId, p.links);
      }
    }
    addLinks(null, backup.inbox);
    reminders = importReminders(db, backup.reminders ?? []);
    snippets = importSnippets(db, backup.snippets ?? [], refs);
  })();
  return { imported, skipped, reminders, snippets };
}
