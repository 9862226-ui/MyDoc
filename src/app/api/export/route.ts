import { route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { toBookmarksHtml, toCsv } from "@/lib/export";
import { exportBackup, getAppData } from "@/lib/repo";
import { exportWork } from "@/lib/worklog-repo";

export const dynamic = "force-dynamic";

export const GET = route((req) => {
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const date = new Date().toISOString().slice(0, 10);
  const download = (body: string, type: string, ext: string) =>
    new Response(body, {
      headers: {
        "content-type": `${type}; charset=utf-8`,
        "content-disposition": `attachment; filename="mydoc-${date}.${ext}"`,
      },
    });

  const db = getDb();
  if (format === "csv") return download(toCsv(getAppData(db)), "text/csv", "csv");
  if (format === "html") return download(toBookmarksHtml(getAppData(db)), "text/html", "html");
  // JSON 备份里也带上工作记录
  return download(JSON.stringify({ ...exportBackup(db), work: exportWork(db) }, null, 2), "application/json", "json");
});
