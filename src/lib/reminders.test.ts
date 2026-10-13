import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db";
import * as rr from "./reminder-repo";
import { isReminderDue, nextDueDate, reminderState } from "./reminders";
import * as repo from "./repo";
import { backupSchema, reminderCreateSchema } from "./schemas";
import type { Reminder } from "./types";

const today = new Date(2026, 9, 13, 9, 0);

function reminder(patch: Partial<Reminder>): Reminder {
  return {
    id: 1,
    title: "阿里云服务器",
    dueDate: "2026-10-20",
    repeat: "yearly",
    remindDays: 7,
    url: "",
    note: "",
    doneAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("nextDueDate", () => {
  it("按月、按年顺延", () => {
    expect(nextDueDate("2026-10-13", "monthly")).toBe("2026-11-13");
    expect(nextDueDate("2026-12-05", "monthly")).toBe("2027-01-05");
    expect(nextDueDate("2026-10-13", "yearly")).toBe("2027-10-13");
    expect(nextDueDate("2026-10-13", "none")).toBe("2026-10-13");
  });

  it("月底的日期不会越来越早", () => {
    expect(nextDueDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextDueDate("2026-02-28", "monthly")).toBe("2026-03-31");
    expect(nextDueDate("2026-04-30", "monthly")).toBe("2026-05-31");
    expect(nextDueDate("2026-01-30", "monthly")).toBe("2026-02-28");
    expect(nextDueDate("2028-02-29", "yearly")).toBe("2029-02-28");
  });
});

describe("reminderState", () => {
  it("按提前天数区分需要处理和以后", () => {
    expect(reminderState(reminder({ dueDate: "2026-10-20" }), today)).toMatchObject({ level: "soon", days: 7 });
    expect(reminderState(reminder({ dueDate: "2026-10-21" }), today)).toMatchObject({
      level: "later",
      label: "8 天后到期",
    });
    expect(reminderState(reminder({ dueDate: "2026-10-13", remindDays: 0 }), today).label).toBe("今天到期");
    expect(reminderState(reminder({ dueDate: "2026-10-10" }), today)).toMatchObject({
      level: "overdue",
      label: "已过期 3 天",
    });
    expect(reminderState(reminder({ dueDate: "2027-03-01" }), today).label).toBe("5 个月后到期");
  });

  it("已完成的不再提醒", () => {
    const r = reminder({ dueDate: "2026-10-01", doneAt: "2026-10-02T00:00:00Z" });
    expect(reminderState(r, today).level).toBe("done");
    expect(isReminderDue(r, today)).toBe(false);
    expect(isReminderDue(reminder({ dueDate: "2026-10-15" }), today)).toBe(true);
  });
});

describe("提醒的增删改", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  const input = (patch: Partial<rr.ReminderInput> = {}): rr.ReminderInput => ({
    title: "域名 mydoc.cn",
    dueDate: "2026-11-01",
    repeat: "yearly",
    remindDays: 30,
    url: "",
    note: "",
    ...patch,
  });

  it("重复的提醒处理完顺延到下一期，不重复的标记完成", () => {
    const yearly = rr.createReminder(db, input());
    expect(rr.completeReminder(db, yearly.id)).toMatchObject({ dueDate: "2027-11-01", doneAt: null });

    const once = rr.createReminder(db, input({ title: "退押金", repeat: "none" }));
    const done = rr.completeReminder(db, once.id);
    expect(done.doneAt).not.toBeNull();
    expect(rr.updateReminder(db, once.id, { done: false }).doneAt).toBeNull();
  });

  it("出现在 AppData 里，删除后消失", () => {
    const r = rr.createReminder(db, input());
    expect(repo.getAppData(db).reminders.map((x) => x.id)).toEqual([r.id]);
    rr.deleteReminder(db, r.id);
    expect(repo.getAppData(db).reminders).toEqual([]);
    expect(() => rr.deleteReminder(db, r.id)).toThrow("提醒不存在");
  });

  it("校验：链接可以为空，填了要是网址", () => {
    expect(reminderCreateSchema.parse({ title: "会员", dueDate: "2026-12-01" })).toMatchObject({
      repeat: "none",
      remindDays: 7,
      url: "",
    });
    expect(reminderCreateSchema.parse({ title: "会员", dueDate: "2026-12-01", url: "aliyun.com" }).url).toBe(
      "https://aliyun.com/",
    );
    expect(reminderCreateSchema.safeParse({ title: "会员", dueDate: "2026-12-01", url: "javascript:x" }).success).toBe(
      false,
    );
  });

  it("随 JSON 备份导出和恢复，重复恢复不会多出来", () => {
    rr.createReminder(db, input({ note: "账号 admin" }));
    const backup = backupSchema.parse(JSON.parse(JSON.stringify(repo.exportBackup(db))));
    const db2 = openDb(":memory:");
    expect(repo.importBackup(db2, backup).reminders).toBe(1);
    expect(repo.importBackup(db2, backup).reminders).toBe(0);
    expect(rr.listReminders(db2)).toMatchObject([{ title: "域名 mydoc.cn", note: "账号 admin", remindDays: 30 }]);
  });

  it("旧版本的备份没有提醒也能恢复", () => {
    const old = { app: "mydoc", version: 1, exportedAt: "2026-01-01T00:00:00Z", groups: [], inbox: [] };
    expect(repo.importBackup(db, backupSchema.parse(old))).toEqual({ imported: 0, skipped: 0, reminders: 0, snippets: 0 });
  });
});
