import fs from "node:fs";
import path from "node:path";
import { route } from "@/lib/api";
import { backupDir, isBackupName } from "@/lib/backup";
import { HttpError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** 下载备份文件 */
export const GET = route(async (_req, ctx: { params: Promise<{ name: string }> }) => {
  const { name } = await ctx.params;
  if (!isBackupName(name)) throw new HttpError(400, "文件名不正确");
  const file = path.join(backupDir(), name);
  if (!fs.existsSync(file)) throw new HttpError(404, "备份不存在");
  return new Response(fs.readFileSync(file), {
    headers: { "content-type": "application/vnd.sqlite3", "content-disposition": `attachment; filename="${name}"` },
  });
});
