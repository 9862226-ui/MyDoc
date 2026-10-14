import fs from "node:fs";
import path from "node:path";
import { route } from "@/lib/api";
import { dataDir } from "@/lib/db";

/** 当前部署的版本：部署脚本每次更新时写到 data/version.json；本地开发时没有 */
export const GET = route(() => {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(dataDir(), "version.json"), "utf8")) as {
      commit?: unknown;
      date?: unknown;
    };
    if (typeof v.commit === "string") return { commit: v.commit, date: typeof v.date === "string" ? v.date : "" };
  } catch {
    // 没有版本文件
  }
  return { commit: null, date: "" };
});
