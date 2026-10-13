import type { DB } from "./db";
import { HttpError } from "./errors";
import { normalizeTags } from "./repo";
import type { Snippet } from "./types";

const now = () => new Date().toISOString();

interface SnippetRow {
  id: number;
  content: string;
  project_id: number | null;
  tags_json: string;
  source_url: string;
  source_title: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

function toSnippet(r: SnippetRow): Snippet {
  let tags: string[] = [];
  try {
    tags = JSON.parse(r.tags_json) as string[];
  } catch {
    // 数据损坏时当作没有标签
  }
  return {
    id: r.id,
    content: r.content,
    projectId: r.project_id,
    tags,
    sourceUrl: r.source_url,
    sourceTitle: r.source_title,
    pinned: !!r.pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface SnippetInput {
  content: string;
  projectId: number | null;
  tags: string[];
  sourceUrl: string;
  sourceTitle: string;
  pinned: boolean;
}

/** 置顶的在前，其余新的在前 */
export function listSnippets(db: DB): Snippet[] {
  return (
    db.prepare("SELECT * FROM snippets ORDER BY pinned DESC, created_at DESC, id DESC").all() as SnippetRow[]
  ).map(toSnippet);
}

export function getSnippet(db: DB, id: number): Snippet {
  const row = db.prepare("SELECT * FROM snippets WHERE id = ?").get(id) as SnippetRow | undefined;
  if (!row) throw new HttpError(404, "摘录不存在");
  return toSnippet(row);
}

function assertProject(db: DB, projectId: number | null): void {
  if (projectId !== null && !db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) {
    throw new HttpError(400, "项目不存在");
  }
}

export function createSnippet(db: DB, input: SnippetInput, createdAt = now()): Snippet {
  assertProject(db, input.projectId);
  const r = db
    .prepare(
      `INSERT INTO snippets (content, project_id, tags_json, source_url, source_title, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.content,
      input.projectId,
      JSON.stringify(normalizeTags(input.tags)),
      input.sourceUrl,
      input.sourceTitle,
      Number(input.pinned),
      createdAt,
      now(),
    );
  return getSnippet(db, Number(r.lastInsertRowid));
}

export function updateSnippet(db: DB, id: number, patch: Partial<SnippetInput>): Snippet {
  const cur = getSnippet(db, id);
  if (patch.projectId !== undefined) assertProject(db, patch.projectId);
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  db.prepare(
    `UPDATE snippets SET content = ?, project_id = ?, tags_json = ?, source_url = ?, source_title = ?, pinned = ?,
       updated_at = ? WHERE id = ?`,
  ).run(
    next.content,
    next.projectId,
    JSON.stringify(normalizeTags(next.tags)),
    next.sourceUrl,
    next.sourceTitle,
    Number(next.pinned),
    now(),
    id,
  );
  return getSnippet(db, id);
}

export function deleteSnippet(db: DB, id: number): Snippet {
  const s = getSnippet(db, id);
  db.prepare("DELETE FROM snippets WHERE id = ?").run(id);
  return s;
}
