import type { DB } from "./db";
import { HttpError } from "./errors";
import type { SpecialDay } from "./holidays";
import { createMeeting, listMeetings } from "./meeting-repo";
import { getNotifyConfig } from "./notify";
import { pinyinIndex } from "./pinyin";
import { getSetting, setSetting } from "./settings";
import {
  DEFAULT_WORK_SETTINGS,
  reportKey,
  shiftDate,
  weekStart,
  type DailyFields,
  type Health,
  type Period,
  type ProjectUpdate,
  type ReportKind,
  type WeeklyFields,
  type WorkData,
  type WorkLog,
  type WorkProject,
  type WorkSettings,
} from "./worklog";

const now = () => new Date().toISOString();

/* ---------- 设置 ---------- */

const SETTINGS_KEY = "worklog";
export const getWorkSettings = (db: DB) => getSetting(db, SETTINGS_KEY, DEFAULT_WORK_SETTINGS);
export const setWorkSettings = (db: DB, s: WorkSettings) => setSetting(db, SETTINGS_KEY, s);

export interface RemindState {
  /** 已经提醒过的日期 / 周（周一的日期） */
  daily?: string;
  weekly?: string;
  /** 每周开工提醒（周一的日期） */
  digest?: string;
  /** 推送失败的次数：同一次提醒最多试 3 次 */
  fails: Record<string, number>;
  last?: { at: string; ok: boolean; message: string };
}

const REMIND_STATE_KEY = "worklog.remind";
export const getRemindState = (db: DB) => getSetting<RemindState>(db, REMIND_STATE_KEY, { fails: {} });
export const setRemindState = (db: DB, s: RemindState) => setSetting(db, REMIND_STATE_KEY, s);

/* ---------- 报工项目 ---------- */

interface ProjectRow {
  id: number;
  name: string;
  code: string;
  task_name: string;
  task_code: string;
  archived: number;
  sort: number;
}

const toProject = (r: ProjectRow): WorkProject => ({
  id: r.id,
  name: r.name,
  code: r.code,
  taskName: r.task_name,
  taskCode: r.task_code,
  archived: !!r.archived,
  sort: r.sort,
});

export interface WorkProjectInput {
  name: string;
  code: string;
  taskName: string;
  taskCode: string;
  archived: boolean;
}

export function listWorkProjects(db: DB): WorkProject[] {
  return (db.prepare("SELECT * FROM work_projects ORDER BY archived, sort, id").all() as ProjectRow[]).map(toProject);
}

function getWorkProject(db: DB, id: number): WorkProject {
  const row = db.prepare("SELECT * FROM work_projects WHERE id = ?").get(id) as ProjectRow | undefined;
  if (!row) throw new HttpError(404, "项目不存在");
  return toProject(row);
}

export function createWorkProject(db: DB, input: WorkProjectInput): WorkProject {
  const sort = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM work_projects").get() as { n: number }).n;
  const r = db
    .prepare(
      "INSERT INTO work_projects (name, code, task_name, task_code, archived, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(input.name, input.code, input.taskName, input.taskCode, input.archived ? 1 : 0, sort, now());
  return getWorkProject(db, Number(r.lastInsertRowid));
}

export function updateWorkProject(db: DB, id: number, patch: Partial<WorkProjectInput>): WorkProject {
  const p = { ...getWorkProject(db, id), ...patch };
  db.prepare(
    "UPDATE work_projects SET name = ?, code = ?, task_name = ?, task_code = ?, archived = ? WHERE id = ?",
  ).run(p.name, p.code, p.taskName, p.taskCode, p.archived ? 1 : 0, id);
  return getWorkProject(db, id);
}

/** 删除项目；它下面的记录保留，变成「未选择项目」 */
export function deleteWorkProject(db: DB, id: number): void {
  getWorkProject(db, id);
  db.prepare("DELETE FROM work_projects WHERE id = ?").run(id);
}

/** 按 id 或名称找项目（MCP 用）；名称不区分大小写，可以只写一部分 */
export function findWorkProject(db: DB, ref: number | string): WorkProject | undefined {
  const list = listWorkProjects(db);
  if (typeof ref === "number") return list.find((p) => p.id === ref);
  const q = ref.trim().toLowerCase();
  return (
    list.find((p) => p.name.toLowerCase() === q || p.code.toLowerCase() === q) ??
    list.find((p) => !p.archived && p.name.toLowerCase().includes(q))
  );
}

/* ---------- 工作记录 ---------- */

interface LogRow {
  id: number;
  date: string;
  period: string;
  project_id: number | null;
  content: string;
  detail: string;
  hours: number | null;
  done: number;
  source: string;
  created_at: string;
  updated_at: string;
}

const toLog = (r: LogRow): WorkLog => ({
  id: r.id,
  date: r.date,
  period: r.period === "pm" ? "pm" : "am",
  projectId: r.project_id,
  content: r.content,
  detail: r.detail,
  hours: r.hours,
  done: !!r.done,
  source: r.source,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface WorkLogInput {
  date: string;
  period: Period;
  projectId: number | null;
  content: string;
  detail?: string;
  hours: number | null;
  done: boolean;
}

export function listWorkLogs(db: DB, from: string, to: string): WorkLog[] {
  return (
    db
      .prepare("SELECT * FROM work_logs WHERE date >= ? AND date <= ? ORDER BY date, created_at, id")
      .all(from, to) as LogRow[]
  ).map(toLog);
}

function getWorkLog(db: DB, id: number): WorkLog {
  const row = db.prepare("SELECT * FROM work_logs WHERE id = ?").get(id) as LogRow | undefined;
  if (!row) throw new HttpError(404, "记录不存在");
  return toLog(row);
}

function assertProject(db: DB, projectId: number | null): void {
  if (projectId !== null && !db.prepare("SELECT 1 FROM work_projects WHERE id = ?").get(projectId)) {
    throw new HttpError(400, "项目不存在");
  }
}

export function createWorkLogs(db: DB, inputs: WorkLogInput[], source = "web"): WorkLog[] {
  const stmt = db.prepare(
    `INSERT INTO work_logs (date, period, project_id, content, detail, hours, done, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return db.transaction(() =>
    inputs.map((i) => {
      assertProject(db, i.projectId);
      const t = now();
      const r = stmt.run(
        i.date,
        i.period,
        i.projectId,
        i.content,
        i.detail ?? "",
        i.hours,
        i.done ? 1 : 0,
        source,
        t,
        t,
      );
      return getWorkLog(db, Number(r.lastInsertRowid));
    }),
  )();
}

export function updateWorkLog(db: DB, id: number, patch: Partial<WorkLogInput>): WorkLog {
  const l = { ...getWorkLog(db, id), ...patch };
  if (patch.projectId !== undefined) assertProject(db, l.projectId);
  db.prepare(
    "UPDATE work_logs SET date = ?, period = ?, project_id = ?, content = ?, detail = ?, hours = ?, done = ?, updated_at = ? WHERE id = ?",
  ).run(l.date, l.period, l.projectId, l.content, l.detail, l.hours, l.done ? 1 : 0, now(), id);
  return getWorkLog(db, id);
}

/** 删除，返回被删的记录（页面上「撤销」时用它重新创建） */
export function deleteWorkLog(db: DB, id: number): WorkLog {
  const l = getWorkLog(db, id);
  db.prepare("DELETE FROM work_logs WHERE id = ?").run(id);
  return l;
}

/* ---------- 手动改过的报告字段 ---------- */

/** 合并保存；值为 null 的字段恢复自动生成 */
export function setReportFields(
  db: DB,
  kind: ReportKind,
  key: string,
  patch: Record<string, unknown>,
): DailyFields & WeeklyFields {
  const fields: Record<string, unknown> = { ...getReportFields(db, kind, key) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete fields[k];
    else if (v !== undefined) fields[k] = v;
  }
  db.prepare(
    `INSERT INTO work_reports (kind, period_key, fields_json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (kind, period_key) DO UPDATE SET fields_json = excluded.fields_json, updated_at = excluded.updated_at`,
  ).run(kind, key, JSON.stringify(fields), now());
  return fields;
}

export function getReportFields(db: DB, kind: ReportKind, key: string): DailyFields & WeeklyFields {
  const row = db.prepare("SELECT fields_json FROM work_reports WHERE kind = ? AND period_key = ?").get(kind, key) as
    | { fields_json: string }
    | undefined;
  try {
    return row ? (JSON.parse(row.fields_json) as DailyFields & WeeklyFields) : {};
  } catch {
    return {};
  }
}

/** 某个日期所在那一周的全部数据（日报和周报都从这里算） */
export function getWorkWeek(db: DB, date: string): WorkData {
  const start = weekStart(date);
  const end = shiftDate(start, 6);
  // 周报里的「上周计划」要用到上一周的记录和整理结果
  const prev = shiftDate(start, -7);
  const rows = db
    .prepare(
      `SELECT kind, period_key, fields_json FROM work_reports
       WHERE (kind = 'daily' AND period_key >= ? AND period_key <= ?) OR (kind = 'weekly' AND period_key IN (?, ?))`,
    )
    .all(start, end, start, prev) as { kind: ReportKind; period_key: string; fields_json: string }[];
  const reports: WorkData["reports"] = {};
  for (const r of rows) {
    try {
      reports[reportKey(r.kind, r.period_key)] = JSON.parse(r.fields_json);
    } catch {
      // 数据损坏时当作没改过
    }
  }
  return {
    projects: listWorkProjects(db),
    logs: listWorkLogs(db, prev, end),
    settings: getWorkSettings(db),
    reports,
    remind: { pushReady: !!getNotifyConfig(db).target.trim(), last: getRemindState(db).last },
    updates: listProjectUpdates(db),
  };
}

/** 全部记录（日历、周报列表、检索用）；个人使用的数据量不大，一次取完 */
export function getWorkAll(db: DB): WorkData {
  const rows = db.prepare("SELECT kind, period_key, fields_json FROM work_reports").all() as {
    kind: ReportKind;
    period_key: string;
    fields_json: string;
  }[];
  const reports: WorkData["reports"] = {};
  for (const r of rows) {
    try {
      reports[reportKey(r.kind, r.period_key)] = JSON.parse(r.fields_json);
    } catch {
      // 数据损坏时当作没改过
    }
  }
  const projects = listWorkProjects(db);
  const projectName = (id: number | null) => projects.find((p) => p.id === id)?.name ?? "";
  const logs = (db.prepare("SELECT * FROM work_logs ORDER BY date, created_at, id").all() as LogRow[]).map(toLog);
  // 拼音搜索用：内容在前（高亮按第一段算），项目名在后
  for (const l of logs) l.py = pinyinIndex(l.content, projectName(l.projectId));
  return {
    projects,
    logs,
    settings: getWorkSettings(db),
    reports,
    remind: { pushReady: !!getNotifyConfig(db).target.trim(), last: getRemindState(db).last },
    updates: listProjectUpdates(db),
  };
}

/* ---------- JSON 备份 ---------- */

export interface WorkBackup {
  projects: { name: string; code: string; taskName: string; taskCode: string; archived: boolean }[];
  /** project 是项目名称，恢复时按名称找项目 */
  logs: {
    date: string;
    period: Period;
    project: string | null;
    content: string;
    /** 旧版本的备份里没有 */
    detail?: string;
    hours: number | null;
    done: boolean;
    source: string;
    createdAt: string;
  }[];
  reports: { kind: ReportKind; key: string; fields: Record<string, unknown> }[];
  settings: WorkSettings;
  /** 会议纪要；project 是报工项目名称 */
  meetings?: {
    title: string;
    date: string;
    project: string | null;
    attendees: string;
    source: string;
    notes: string;
    createdAt: string;
  }[];
  /** 项目每周的进展；project 是报工项目名称 */
  updates?: { project: string; week: string; health: Health; note: string }[];
}

export function exportWork(db: DB): WorkBackup {
  const projects = listWorkProjects(db);
  const name = (id: number | null) => projects.find((p) => p.id === id)?.name ?? null;
  const logs = (db.prepare("SELECT * FROM work_logs ORDER BY date, created_at, id").all() as LogRow[]).map(toLog);
  const reports = db.prepare("SELECT kind, period_key, fields_json FROM work_reports").all() as {
    kind: ReportKind;
    period_key: string;
    fields_json: string;
  }[];
  return {
    projects: projects.map(({ name, code, taskName, taskCode, archived }) => ({
      name,
      code,
      taskName,
      taskCode,
      archived,
    })),
    logs: logs.map((l) => ({
      date: l.date,
      period: l.period,
      project: name(l.projectId),
      content: l.content,
      detail: l.detail,
      hours: l.hours,
      done: l.done,
      source: l.source,
      createdAt: l.createdAt,
    })),
    reports: reports.flatMap((r) => {
      try {
        return [{ kind: r.kind, key: r.period_key, fields: JSON.parse(r.fields_json) as Record<string, unknown> }];
      } catch {
        return [];
      }
    }),
    settings: getWorkSettings(db),
    meetings: listMeetings(db).map((m) => ({
      title: m.title,
      date: m.date,
      project: name(m.projectId),
      attendees: m.attendees,
      source: m.source,
      notes: m.notes,
      createdAt: m.createdAt,
    })),
    updates: listProjectUpdates(db).map((u) => ({
      project: name(u.projectId) ?? "",
      week: u.week,
      health: u.health,
      note: u.note,
    })),
  };
}

/**
 * 从备份恢复工作记录（合并，不删除现有数据）：项目按名称合并；同一天同一项目内容相同的记录跳过；
 * 已经有的日报、周报整理结果和设置不覆盖。返回新增的记录条数
 */
export function importWork(db: DB, w: WorkBackup): number {
  return db.transaction(() => {
    const ids = new Map(listWorkProjects(db).map((p) => [p.name, p.id]));
    for (const p of w.projects) {
      if (!ids.has(p.name)) ids.set(p.name, createWorkProject(db, p).id);
    }
    const exists = db.prepare("SELECT 1 FROM work_logs WHERE date = ? AND content = ? AND project_id IS ?");
    const insert = db.prepare(
      `INSERT INTO work_logs (date, period, project_id, content, detail, hours, done, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let added = 0;
    for (const l of w.logs) {
      const projectId = l.project === null ? null : (ids.get(l.project) ?? null);
      if (exists.get(l.date, l.content, projectId)) continue;
      insert.run(
        l.date,
        l.period,
        projectId,
        l.content,
        l.detail ?? "",
        l.hours,
        l.done ? 1 : 0,
        l.source,
        l.createdAt,
        now(),
      );
      added++;
    }
    const hasReport = db.prepare("SELECT 1 FROM work_reports WHERE kind = ? AND period_key = ?");
    for (const r of w.reports) {
      if (!hasReport.get(r.kind, r.key)) setReportFields(db, r.kind, r.key, r.fields);
    }
    if (!db.prepare("SELECT 1 FROM settings WHERE key = ?").get(SETTINGS_KEY)) setWorkSettings(db, w.settings);
    // 会议纪要：同一天同名的跳过
    const hasMeeting = db.prepare("SELECT 1 FROM meetings WHERE date = ? AND title = ?");
    for (const m of w.meetings ?? []) {
      if (hasMeeting.get(m.date, m.title)) continue;
      createMeeting(db, { ...m, projectId: m.project === null ? null : (ids.get(m.project) ?? null) }, m.createdAt);
    }
    // 项目进展：已经写过的那一周不覆盖
    const hasUpdate = db.prepare("SELECT 1 FROM work_project_updates WHERE project_id = ? AND week = ?");
    for (const u of w.updates ?? []) {
      const projectId = ids.get(u.project);
      if (projectId === undefined || hasUpdate.get(projectId, u.week)) continue;
      setProjectUpdate(db, { projectId, week: u.week, health: u.health, note: u.note });
    }
    return added;
  })();
}

/* ---------- 项目进展 ---------- */

interface UpdateRow {
  id: number;
  project_id: number;
  week: string;
  health: string;
  note: string;
  updated_at: string;
}

const toUpdate = (r: UpdateRow): ProjectUpdate => ({
  id: r.id,
  projectId: r.project_id,
  week: r.week,
  health: (["on_track", "at_risk", "off_track"].includes(r.health) ? r.health : "on_track") as Health,
  note: r.note,
  updatedAt: r.updated_at,
});

export function listProjectUpdates(db: DB): ProjectUpdate[] {
  return (db.prepare("SELECT * FROM work_project_updates ORDER BY week, id").all() as UpdateRow[]).map(toUpdate);
}

/** 写某个项目某一周的进展（已有的覆盖） */
export function setProjectUpdate(
  db: DB,
  u: { projectId: number; week: string; health: Health; note: string },
): ProjectUpdate {
  assertProject(db, u.projectId);
  const week = weekStart(u.week);
  const t = now();
  db.prepare(
    `INSERT INTO work_project_updates (project_id, week, health, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (project_id, week) DO UPDATE SET health = excluded.health, note = excluded.note, updated_at = excluded.updated_at`,
  ).run(u.projectId, week, u.health, u.note.trim(), t, t);
  return toUpdate(
    db
      .prepare("SELECT * FROM work_project_updates WHERE project_id = ? AND week = ?")
      .get(u.projectId, week) as UpdateRow,
  );
}

export function deleteProjectUpdate(db: DB, projectId: number, week: string): void {
  db.prepare("DELETE FROM work_project_updates WHERE project_id = ? AND week = ?").run(projectId, weekStart(week));
}

/* ---------- 节假日、补班 ---------- */

/** 导入某一年的法定节假日；手动设置过的日子保留手动的 */
export function importHolidays(db: DB, year: number, days: Record<string, SpecialDay>): WorkSettings {
  const s = getWorkSettings(db);
  const kept = Object.fromEntries(
    Object.entries(s.specialDays).filter(([d, v]) => v.manual || !d.startsWith(`${year}-`)),
  );
  const next: WorkSettings = {
    ...s,
    specialDays: { ...days, ...kept },
    holidayYears: [...new Set([...s.holidayYears, year])].sort(),
  };
  setWorkSettings(db, next);
  return next;
}

/** 手动把某天设成休息日 / 补班日；mode 为 null 时恢复默认 */
export function setSpecialDay(db: DB, date: string, mode: "off" | "work" | null): WorkSettings {
  const s = getWorkSettings(db);
  const specialDays = { ...s.specialDays };
  if (mode === null) delete specialDays[date];
  else specialDays[date] = { off: mode === "off", name: mode === "off" ? "休息" : "补班", manual: true };
  const next = { ...s, specialDays };
  setWorkSettings(db, next);
  return next;
}
