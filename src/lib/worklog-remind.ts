import type { DB } from "./db";
import { getNotifyConfig, sendMessage, type Message, type Sender } from "./notify";
import { zonedNow } from "./settings";
import { buildDaily, buildWeekly, dayStatus, reportKey, shiftDate, weekStart, type WorkData } from "./worklog";
import { getRemindState, getWorkSettings, getWorkWeek, setRemindState } from "./worklog-repo";

/** 下班提醒：到点推送到微信、钉钉，提醒写日报、交周报，消息里带上整理好的内容 */

export type RemindKind = "daily" | "weekly";

const MAX_ATTEMPTS = 3;
/** 服务停了一段时间再启动时，超过设定时间 3 小时就不补发了，免得半夜收到 */
const LATE_MINUTES = 180;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** 现在是否到了提醒时间（且没有晚太久） */
export function isDue(time: string, now: Date): boolean {
  const diff = now.getHours() * 60 + now.getMinutes() - toMinutes(time);
  return diff >= 0 && diff <= LATE_MINUTES;
}

const link = (siteUrl: string) => (siteUrl ? `${siteUrl.replace(/\/+$/, "")}/work` : "");

export function remindMessage(kind: RemindKind, data: WorkData, date: string, siteUrl: string, withReport: boolean) {
  const md: string[] = [];
  const txt: string[] = [];
  const both = (s: string) => {
    md.push(s);
    txt.push(s);
  };
  const section = (title: string, body: string) => {
    if (!body.trim()) return;
    md.push(`**${title}**`, body);
    txt.push(`【${title}】`, body);
  };
  let note = "";
  let title: string;
  if (kind === "daily") {
    const r = buildDaily(data, date);
    title = "该写日报了";
    if (!r.logCount) both("今天还没有记录工作，花一分钟记几句，日报马上就能整理好。");
    else if (!withReport) both(`今天记了 ${r.logCount} 条工作，日报已经整理好了。`);
    else {
      both(`今天记了 ${r.logCount} 条工作，日报已经整理好，可以直接复制：`);
      section("上午总结", r.amSummary);
      if (r.pmSummary !== r.amSummary) section("下午总结", r.pmSummary);
      else both("（下午总结和上午相同）");
    }
  } else {
    const r = buildWeekly(data, date);
    title = `该交周报了（第 ${r.week} 周）`;
    // 顺便提醒这一周还没交的日报
    const statuses = Array.from({ length: 7 }, (_, i) => shiftDate(r.start, i))
      .filter((d) => d <= date)
      .map((d) => dayStatus(data, d, date));
    const unsubmitted = statuses.filter((x) => x === "unsubmitted").length;
    const missed = statuses.filter((x) => x === "missed").length;
    const parts = [unsubmitted && `${unsubmitted} 天日报没提交`, missed && `${missed} 天没有记录`].filter(Boolean);
    note = parts.length ? `本周还有 ${parts.join("、")}。` : "";
    if (!r.logCount) both("这一周还没有工作记录，先补几条，周报就能整理好。");
    else if (!withReport) both(`这周工作 ${r.workDays} 天，记了 ${r.logCount} 条，周报已经整理好了。`);
    else {
      both(`这周工作 ${r.workDays} 天，记了 ${r.logCount} 条，周报已经整理好，可以直接复制：`);
      section("本周总结", r.summaryText);
      section("下周计划", r.planText);
    }
  }
  if (note) both(note);
  const url = link(siteUrl);
  if (url) {
    md.push(`[打开工作记录](${url})`);
    txt.push(url);
  }
  return {
    title: `MyDoc：${title}`,
    markdown: md.join("\n"),
    text: txt.join("\n"),
    url: url || undefined,
  } satisfies Message;
}

/** 每分钟检查一次：到点了就推送 */
export async function runWorkRemind(db: DB, now = new Date(), send: Sender = sendMessage) {
  const c = getNotifyConfig(db);
  const s = getWorkSettings(db);
  if (!c.target.trim() || (!s.remindDaily && !s.remindWeekly)) return [];
  const t = zonedNow(c.timeZone, now);
  const day = t.local.getDay();
  const due: { kind: RemindKind; key: string }[] = [];
  const state = getRemindState(db);
  const week = weekStart(t.date);
  const data = getWorkWeek(db, t.date);
  // 已经标记提交的就不再提醒
  const dailyDone = !!data.reports[reportKey("daily", t.date)]?.submittedAt;
  const weeklyDone = !!data.reports[reportKey("weekly", week)]?.submittedAt;
  if (
    s.remindDaily &&
    !dailyDone &&
    s.remindDays.includes(day) &&
    state.daily !== t.date &&
    isDue(s.remindTime, t.local)
  ) {
    due.push({ kind: "daily", key: t.date });
  }
  if (s.remindWeekly && !weeklyDone && s.weeklyDay === day && state.weekly !== week && isDue(s.weeklyTime, t.local)) {
    due.push({ kind: "weekly", key: week });
  }

  const results: string[] = [];
  for (const { kind, key } of due) {
    const failKey = `${kind}:${key}`;
    const st = getRemindState(db);
    const attempts = st.fails[failKey] ?? 0;
    if (attempts >= MAX_ATTEMPTS) continue;
    try {
      await send(c, remindMessage(kind, getWorkWeek(db, t.date), t.date, c.siteUrl, s.remindWithReport));
      setRemindState(db, {
        ...st,
        [kind]: key,
        fails: {},
        last: { at: now.toISOString(), ok: true, message: kind === "daily" ? "已提醒写日报" : "已提醒交周报" },
      });
      results.push(`${kind}:sent`);
    } catch (e) {
      setRemindState(db, {
        ...st,
        fails: { [failKey]: attempts + 1 },
        last: { at: now.toISOString(), ok: false, message: (e as Error).message },
      });
      results.push(`${kind}:failed`);
    }
  }
  return results;
}

/** 现在就发一条，看看效果 */
export async function sendTestRemind(db: DB, kind: RemindKind, send: Sender = sendMessage): Promise<void> {
  const c = getNotifyConfig(db);
  if (!c.target.trim()) throw new Error("还没有设置推送方式，请先在「设置 › 提醒推送」里填写");
  const t = zonedNow(c.timeZone);
  const m = remindMessage(kind, getWorkWeek(db, t.date), t.date, c.siteUrl, getWorkSettings(db).remindWithReport);
  await send(c, { ...m, title: `${m.title}（测试）` });
}
