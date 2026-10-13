/** 服务启动时执行一次：开启每天自动备份 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackupSchedule } = await import("./lib/backup");
    startBackupSchedule();
  }
}
