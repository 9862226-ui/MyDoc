import { ensureDailyBackup } from "./backup";
import { syncLatestBackup } from "./backup-sync";
import { getDb } from "./db";
import { runDailyNotify } from "./notify";
import { runWorkRemind } from "./worklog-remind";

const globalForScheduler = globalThis as unknown as { __mydocSchedulerStarted?: boolean };

/** 定时任务：每天自动备份、把备份传到异地、推送到期提醒 */
export async function runScheduledTasks(now = new Date()): Promise<void> {
  const db = getDb();
  try {
    if (await ensureDailyBackup(db, undefined, now)) console.log("[MyDoc] 已自动备份数据库");
  } catch (e) {
    console.error("[MyDoc] 自动备份失败", e);
  }
  try {
    const r = await syncLatestBackup(db, now);
    if (r === "uploaded") console.log("[MyDoc] 已上传备份到异地");
    if (r === "failed") console.error("[MyDoc] 异地备份失败，稍后重试");
  } catch (e) {
    console.error("[MyDoc] 异地备份失败", e);
  }
  try {
    const r = await runDailyNotify(db, now);
    if (r === "sent") console.log("[MyDoc] 已推送到期提醒");
    if (r === "failed") console.error("[MyDoc] 推送到期提醒失败，稍后重试");
  } catch (e) {
    console.error("[MyDoc] 推送到期提醒失败", e);
  }
}

/** 下班提醒要准点，每分钟检查一次 */
export async function runMinuteTasks(now = new Date()): Promise<void> {
  try {
    for (const r of await runWorkRemind(getDb(), now)) {
      if (r.endsWith(":sent")) console.log(`[MyDoc] 已推送${r.startsWith("daily") ? "日报" : "周报"}提醒`);
      else console.error(`[MyDoc] 推送${r.startsWith("daily") ? "日报" : "周报"}提醒失败，稍后重试`);
    }
  } catch (e) {
    console.error("[MyDoc] 推送下班提醒失败", e);
  }
}

/** 服务启动 30 秒后执行一次，之后每 10 分钟检查一次；下班提醒每分钟检查一次 */
export function startScheduler(): void {
  if (globalForScheduler.__mydocSchedulerStarted) return;
  globalForScheduler.__mydocSchedulerStarted = true;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runScheduledTasks();
    } finally {
      running = false;
    }
  };
  setTimeout(run, 30_000).unref();
  setInterval(run, 10 * 60_000).unref();
  let minuteRunning = false;
  setInterval(async () => {
    if (minuteRunning) return;
    minuteRunning = true;
    try {
      await runMinuteTasks();
    } finally {
      minuteRunning = false;
    }
  }, 60_000).unref();
}
