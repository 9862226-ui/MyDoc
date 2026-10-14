import type { DB } from "./db";
import { HttpError } from "./errors";
import { getNotifyConfig } from "./notify";
import { getSetting, setSetting } from "./settings";
import {
  DEFAULT_WORK_SETTINGS,
  reportKey,
  shiftDate,
  weekStart,
  type DailyFields,
  type Period,
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
    `INSERT INTO work_logs (date, period, project_id, content, hours, done, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return db.transaction(() =>
    inputs.map((i) => {
      assertProject(db, i.projectId);
      const t = now();
      const r = stmt.run(i.date, i.period, i.projectId, i.content, i.hours, i.done ? 1 : 0, source, t, t);
      return getWorkLog(db, Number(r.lastInsertRowid));
    }),
  )();
}

export function updateWorkLog(db: DB, id: number, patch: Partial<WorkLogInput>): WorkLog {
  const l = { ...getWorkLog(db, id), ...patch };
  if (patch.projectId !== undefined) assertProject(db, l.projectId);
  db.prepare(
    "UPDATE work_logs SET date = ?, period = ?, project_id = ?, content = ?, hours = ?, done = ?, updated_at = ? WHERE id = ?",
  ).run(l.date, l.period, l.projectId, l.content, l.hours, l.done ? 1 : 0, now(), id);
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
  patch: Record<string, string | null | undefined>,
): DailyFields & WeeklyFields {
  const fields: Record<string, string> = { ...getReportFields(db, kind, key) };
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string") fields[k] = v;
    else if (v === null) delete fields[k];
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
  const rows = db
    .prepare(
      `SELECT kind, period_key, fields_json FROM work_reports
       WHERE (kind = 'daily' AND period_key >= ? AND period_key <= ?) OR (kind = 'weekly' AND period_key = ?)`,
    )
    .all(start, end, start) as { kind: ReportKind; period_key: string; fields_json: string }[];
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
    logs: listWorkLogs(db, start, end),
    settings: getWorkSettings(db),
    reports,
    remind: { pushReady: !!getNotifyConfig(db).target.trim(), last: getRemindState(db).last },
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
  const logs = (db.prepare("SELECT * FROM work_logs ORDER BY date, created_at, id").all() as LogRow[]).map(toLog);
  return {
    projects: listWorkProjects(db),
    logs,
    settings: getWorkSettings(db),
    reports,
    remind: { pushReady: !!getNotifyConfig(db).target.trim(), last: getRemindState(db).last },
  };
}
