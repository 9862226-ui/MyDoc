/**
 * 恢复备份时，内容的编号会变（另一台服务器上已经有别的内容）。
 * 恢复过程中记下「备份里的编号 → 这里的编号」，最后把新导入的内容里的 [[log:12|…]] 换成新编号。
 * 备份里没有的内容改成纯文字（免得指到这里碰巧同编号的别的内容）；旧版本的备份没有编号，不处理
 */
import type { DayPlanItem } from "./dayplan";
import type { DB } from "./db";
import { REF_LABEL, refRegExp, type RefType } from "./refs";

/** 每种内容的正文在哪一列 */
const TEXT_COLUMN: Record<RefType, { table: string; column: string }> = {
  log: { table: "work_logs", column: "detail" },
  meeting: { table: "meetings", column: "notes" },
  snippet: { table: "snippets", column: "content" },
  link: { table: "links", column: "note" },
};

export class ImportRefs {
  private maps: Record<RefType, Map<number, number>> = {
    log: new Map(),
    meeting: new Map(),
    snippet: new Map(),
    link: new Map(),
  };
  private inserted: { type: RefType; id: number }[] = [];
  private dailyReports: string[] = [];
  /** 备份里带了编号（新版本导出的） */
  private hasIds = false;

  /** 记下一条内容：oldId 是备份里的编号；isNew 表示这次新建的（不是跳过的重复内容） */
  add(type: RefType, oldId: number | undefined, newId: number, isNew: boolean): void {
    if (oldId) {
      this.hasIds = true;
      this.maps[type].set(oldId, newId);
    }
    if (isNew) this.inserted.push({ type, id: newId });
  }

  /** 新恢复的某天日报（里面的计划可能关联了工作记录） */
  addDailyReport(date: string): void {
    this.dailyReports.push(date);
  }

  /** 换掉一段文字里的引用 */
  rewrite(text: string): string {
    if (!this.hasIds) return text;
    return text.replace(refRegExp(), (_m, type: RefType, id: string, label?: string) => {
      const next = this.maps[type].get(Number(id));
      if (next) return `[[${type}:${next}${label !== undefined ? `|${label}` : ""}]]`;
      return label?.trim() || REF_LABEL[type];
    });
  }

  /** 恢复完以后调用：改写新导入内容里的引用，修正计划关联的工作记录。返回改了几条 */
  apply(db: DB): number {
    if (!this.hasIds) return 0;
    let changed = 0;
    for (const { type, id } of this.inserted) {
      const { table, column } = TEXT_COLUMN[type];
      const row = db.prepare(`SELECT ${column} AS t FROM ${table} WHERE id = ?`).get(id) as { t: string } | undefined;
      if (!row || !row.t.includes("[[")) continue;
      const next = this.rewrite(row.t);
      if (next === row.t) continue;
      db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`).run(next, id);
      changed++;
    }
    // 计划打勾时关联的工作记录：对不上的去掉关联，免得取消打勾时删错记录
    for (const date of this.dailyReports) {
      const row = db
        .prepare("SELECT fields_json FROM work_reports WHERE kind = 'daily' AND period_key = ?")
        .get(date) as { fields_json: string } | undefined;
      if (!row) continue;
      let fields: { plan?: DayPlanItem[] };
      try {
        fields = JSON.parse(row.fields_json);
      } catch {
        continue;
      }
      if (!fields.plan?.some((i) => i.logId)) continue;
      fields.plan = fields.plan.map((i) => {
        if (!i.logId) return i;
        const logId = this.maps.log.get(i.logId);
        if (logId) return { ...i, logId };
        const { logId: _drop, createdLog: _c, ...rest } = i;
        return rest;
      });
      db.prepare("UPDATE work_reports SET fields_json = ? WHERE kind = 'daily' AND period_key = ?").run(
        JSON.stringify(fields),
        date,
      );
    }
    return changed;
  }
}
