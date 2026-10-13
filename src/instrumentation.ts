/** 服务启动时执行一次：开启定时任务（每天自动备份、异地备份、到期提醒推送） */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
