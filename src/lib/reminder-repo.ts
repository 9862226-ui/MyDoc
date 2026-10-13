import type { DB } from "./db";
import { HttpError } from "./errors";
import { nextDueDate } from "./reminders";
import type { Reminder, RepeatKind } from "./types";

const now = () => new Date().toISOString();

interface ReminderRow {
  id: number;
  title: string;
  due_date: string;
  repeat: string;
  remind_days: number;
  url: string;
  note: string;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

function toReminder(r: ReminderRow): Reminder {
  return {
    id: r.id,
    title: r.title,
    dueDate: r.due_date,
    repeat: (["none", "monthly", "yearly"].includes(r.repeat) ? r.repeat : "none") as RepeatKind,
    remindDays: r.remind_days,
    url: r.url,
    note: r.note,
    doneAt: r.done_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface ReminderInput {
  title: string;
  dueDate: string;
  repeat: RepeatKind;
  remindDays: number;
  url: string;
  note: string;
}

export function listReminders(db: DB): Reminder[] {
  return (db.prepare("SELECT * FROM reminders ORDER BY due_date, id").all() as ReminderRow[]).map(toReminder);
}

export function getReminder(db: DB, id: number): Reminder {
  const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(id) as ReminderRow | undefined;
  if (!row) throw new HttpError(404, "提醒不存在");
  return toReminder(row);
}

export function createReminder(db: DB, input: ReminderInput): Reminder {
  const t = now();
  const r = db
    .prepare(
      `INSERT INTO reminders (title, due_date, repeat, remind_days, url, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.title, input.dueDate, input.repeat, input.remindDays, input.url, input.note, t, t);
  return getReminder(db, Number(r.lastInsertRowid));
}

const COLUMNS: Record<keyof ReminderInput, string> = {
  title: "title",
  dueDate: "due_date",
  repeat: "repeat",
  remindDays: "remind_days",
  url: "url",
  note: "note",
};

export function updateReminder(db: DB, id: number, patch: Partial<ReminderInput> & { done?: boolean }): Reminder {
  getReminder(db, id);
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(COLUMNS) as [keyof ReminderInput, string][]) {
    if (patch[key] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(patch[key]);
    }
  }
  if (patch.done !== undefined) {
    sets.push("done_at = ?");
    values.push(patch.done ? now() : null);
  }
  sets.push("updated_at = ?");
  values.push(now());
  db.prepare(`UPDATE reminders SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  return getReminder(db, id);
}

/** 处理完：重复的顺延到下一个周期，不重复的标记为已完成 */
export function completeReminder(db: DB, id: number): Reminder {
  const r = getReminder(db, id);
  if (r.repeat === "none") return updateReminder(db, id, { done: true });
  return updateReminder(db, id, { dueDate: nextDueDate(r.dueDate, r.repeat) });
}

export function deleteReminder(db: DB, id: number): void {
  getReminder(db, id);
  db.prepare("DELETE FROM reminders WHERE id = ?").run(id);
}

export interface BackupReminder extends ReminderInput {
  doneAt: string | null;
  createdAt: string;
}

export function toBackupReminder(r: Reminder): BackupReminder {
  return {
    title: r.title,
    dueDate: r.dueDate,
    repeat: r.repeat,
    remindDays: r.remindDays,
    url: r.url,
    note: r.note,
    doneAt: r.doneAt,
    createdAt: r.createdAt,
  };
}

/** 从备份恢复提醒：名称和到期日都相同的跳过，返回新增的数量 */
export function importReminders(db: DB, list: BackupReminder[]): number {
  const exists = db.prepare("SELECT 1 FROM reminders WHERE title = ? AND due_date = ?");
  const insert = db.prepare(
    `INSERT INTO reminders (title, due_date, repeat, remind_days, url, note, done_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let added = 0;
  for (const r of list) {
    if (!r.title.trim() || exists.get(r.title, r.dueDate)) continue;
    insert.run(r.title, r.dueDate, r.repeat, r.remindDays, r.url, r.note, r.doneAt, r.createdAt, now());
    added++;
  }
  return added;
}
