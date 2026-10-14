import { nextWorkday, planCandidates, sameText, type DayPlan, type DayPlanItem, type PlanSource } from "./dayplan";
import type { DB } from "./db";
import { HttpError } from "./errors";
import { listMeetings } from "./meeting-repo";
import { buildWeekly, shiftDate, type Period } from "./worklog";
import {
  createWorkLogs,
  deleteWorkLog,
  getReportFields,
  getWorkSettings,
  getWorkWeek,
  listWorkLogs,
  setReportFields,
  updateWorkLog,
} from "./worklog-repo";

/** 开工时往前看几天：前几天没处理的计划、没做完的记录、会议待办 */
const LOOKBACK_DAYS = 14;

const newId = () => Math.random().toString(36).slice(2, 10);

const itemsOf = (db: DB, date: string): DayPlanItem[] => getReportFields(db, "daily", date).plan ?? [];
const saveItems = (db: DB, date: string, items: DayPlanItem[]) =>
  setReportFields(db, "daily", date, { plan: items.length ? items : null });

/** 某天的计划，以及开工时可以挑的事 */
export function getDayPlan(db: DB, date: string): DayPlan {
  const fields = getReportFields(db, "daily", date);
  const items = fields.plan ?? [];
  const from = shiftDate(date, -LOOKBACK_DAYS);
  const logs = listWorkLogs(db, from, date);
  const earlier = logs.filter((l) => l.date < date);
  const todayLogs = logs.filter((l) => l.date === date);

  const leftovers = (
    db
      .prepare(
        `SELECT period_key, fields_json FROM work_reports
         WHERE kind = 'daily' AND period_key >= ? AND period_key < ? ORDER BY period_key DESC`,
      )
      .all(from, date) as { period_key: string; fields_json: string }[]
  ).flatMap((r) => {
    try {
      const plan = (JSON.parse(r.fields_json) as { plan?: DayPlanItem[] }).plan;
      return plan?.length ? [{ date: r.period_key, items: plan }] : [];
    } catch {
      return [];
    }
  });

  const week = buildWeekly(getWorkWeek(db, date), date);
  const weekly = week.lastPlan.filter((p) => !week.doneLastPlan.includes(p.id));
  const meetings = listMeetings(db).filter((m) => m.date >= from && m.date <= date);

  return {
    date,
    items,
    shutdownAt: fields.shutdownAt,
    nextWorkday: nextWorkday(getWorkSettings(db), date),
    candidates: planCandidates({ date, items, logs: earlier, todayLogs, leftovers, weekly, meetings }),
  };
}

export type PlanOp =
  | { op: "add"; items: { text: string; projectId: number | null; source: PlanSource; ref?: string }[] }
  | { op: "check"; id: string; period: Period }
  | { op: "uncheck" | "carry" | "drop" | "restore" | "remove"; id: string }
  | { op: "edit"; id: string; text?: string; projectId?: number | null }
  | { op: "shutdown" };

/** 撤销顺延：把下一个工作日里顺延来、还没动过的那条去掉 */
function undoCarry(db: DB, date: string, item: DayPlanItem) {
  if (item.status !== "carried" || !item.carriedTo) return;
  const target = itemsOf(db, item.carriedTo);
  const next = target.filter((t) => !(t.ref === `${date}:${item.id}` && t.status === "todo"));
  if (next.length !== target.length) saveItems(db, item.carriedTo, next);
}

/** 改计划；返回改完的计划 */
export function applyPlanOp(db: DB, date: string, op: PlanOp): DayPlan {
  db.transaction(() => {
    if (op.op === "shutdown") {
      setReportFields(db, "daily", date, { shutdownAt: new Date().toISOString() });
      return;
    }
    const items = itemsOf(db, date);

    if (op.op === "add") {
      for (const a of op.items) {
        const text = a.text.trim();
        if (!text || items.some((i) => sameText(i.text, text))) continue;
        items.push({ id: newId(), text, projectId: a.projectId, source: a.source, status: "todo", ref: a.ref });
        // 从前几天没处理的计划里挑来的：原来那条记成顺延到今天，下次就不再出现
        if (a.source === "leftover" && a.ref) {
          const [day, id] = a.ref.split(":");
          const old = itemsOf(db, day);
          const hit = old.find((o) => o.id === id && o.status === "todo");
          if (hit) {
            hit.status = "carried";
            hit.carriedTo = date;
            saveItems(db, day, old);
          }
        }
      }
      saveItems(db, date, items);
      return;
    }

    const item = items.find((i) => i.id === op.id);
    if (!item) throw new HttpError(404, "这条计划不存在，刷新一下再试");

    switch (op.op) {
      case "check": {
        // 今天已经记过一样内容的，直接关联；否则新建一条记录
        const existing = listWorkLogs(db, date, date).find((l) => sameText(l.content, item.text));
        if (existing) {
          if (!existing.done) updateWorkLog(db, existing.id, { done: true });
          item.logId = existing.id;
          item.createdLog = false;
        } else {
          const [log] = createWorkLogs(db, [
            { date, period: op.period, projectId: item.projectId, content: item.text, hours: null, done: true },
          ]);
          item.logId = log.id;
          item.createdLog = true;
        }
        item.status = "done";
        break;
      }
      case "uncheck": {
        // 打勾时新建、之后没改过的记录跟着删掉；原来就有的记录保留
        if (item.logId && item.createdLog) {
          const log = listWorkLogs(db, date, date).find((l) => l.id === item.logId);
          if (log && log.content === item.text && !log.detail.trim()) deleteWorkLog(db, log.id);
        }
        item.status = "todo";
        delete item.logId;
        delete item.createdLog;
        break;
      }
      case "carry": {
        const to = nextWorkday(getWorkSettings(db), date);
        const target = itemsOf(db, to);
        if (!target.some((t) => sameText(t.text, item.text))) {
          target.push({
            id: newId(),
            text: item.text,
            projectId: item.projectId,
            source: "carry",
            status: "todo",
            ref: `${date}:${item.id}`,
          });
          saveItems(db, to, target);
        }
        item.status = "carried";
        item.carriedTo = to;
        break;
      }
      case "drop":
        undoCarry(db, date, item);
        item.status = "dropped";
        delete item.carriedTo;
        break;
      case "restore":
        undoCarry(db, date, item);
        item.status = "todo";
        delete item.carriedTo;
        break;
      case "remove":
        undoCarry(db, date, item);
        items.splice(items.indexOf(item), 1);
        break;
      case "edit":
        if (op.text !== undefined && op.text.trim()) item.text = op.text.trim();
        if (op.projectId !== undefined) item.projectId = op.projectId;
        break;
    }
    saveItems(db, date, items);
  })();
  return getDayPlan(db, date);
}
