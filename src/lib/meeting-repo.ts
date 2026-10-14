import type { DB } from "./db";
import { HttpError } from "./errors";
import type { Meeting, MeetingTemplate } from "./meetings";
import { getSetting, setSetting } from "./settings";

const now = () => new Date().toISOString();

interface MeetingRow {
  id: number;
  title: string;
  date: string;
  project_id: number | null;
  attendees: string;
  source: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

const toMeeting = (r: MeetingRow): Meeting => ({
  id: r.id,
  title: r.title,
  date: r.date,
  projectId: r.project_id,
  attendees: r.attendees,
  source: r.source,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface MeetingInput {
  title: string;
  date: string;
  projectId: number | null;
  attendees: string;
  source: string;
  notes: string;
}

/** 新的在前 */
export function listMeetings(db: DB): Meeting[] {
  return (db.prepare("SELECT * FROM meetings ORDER BY date DESC, id DESC").all() as MeetingRow[]).map(toMeeting);
}

export function getMeeting(db: DB, id: number): Meeting {
  const row = db.prepare("SELECT * FROM meetings WHERE id = ?").get(id) as MeetingRow | undefined;
  if (!row) throw new HttpError(404, "会议纪要不存在");
  return toMeeting(row);
}

function assertProject(db: DB, projectId: number | null): void {
  if (projectId !== null && !db.prepare("SELECT 1 FROM work_projects WHERE id = ?").get(projectId)) {
    throw new HttpError(400, "项目不存在");
  }
}

export function createMeeting(db: DB, m: MeetingInput, createdAt = now()): Meeting {
  assertProject(db, m.projectId);
  const r = db
    .prepare(
      `INSERT INTO meetings (title, date, project_id, attendees, source, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(m.title, m.date, m.projectId, m.attendees, m.source, m.notes, createdAt, now());
  return getMeeting(db, Number(r.lastInsertRowid));
}

export function updateMeeting(db: DB, id: number, patch: Partial<MeetingInput>): Meeting {
  const m = { ...getMeeting(db, id), ...patch };
  if (patch.projectId !== undefined) assertProject(db, m.projectId);
  db.prepare(
    "UPDATE meetings SET title = ?, date = ?, project_id = ?, attendees = ?, source = ?, notes = ?, updated_at = ? WHERE id = ?",
  ).run(m.title, m.date, m.projectId, m.attendees, m.source, m.notes, now(), id);
  return getMeeting(db, id);
}

/** 删除，返回被删的纪要（页面上「撤销」时用它重新创建） */
export function deleteMeeting(db: DB, id: number): Meeting {
  const m = getMeeting(db, id);
  db.prepare("DELETE FROM meetings WHERE id = ?").run(id);
  return m;
}

/* ---------- 自己存的纪要模板 ---------- */

const TEMPLATES_KEY = "meetingTemplates";

export const listMeetingTemplates = (db: DB): MeetingTemplate[] =>
  getSetting(db, TEMPLATES_KEY, { templates: [] as MeetingTemplate[] }).templates.map((t) => ({ ...t, custom: true }));

export function setMeetingTemplates(
  db: DB,
  templates: { id: string; name: string; notes: string }[],
): MeetingTemplate[] {
  setSetting(db, TEMPLATES_KEY, { templates: templates.map(({ id, name, notes }) => ({ id, name, notes })) });
  return listMeetingTemplates(db);
}
