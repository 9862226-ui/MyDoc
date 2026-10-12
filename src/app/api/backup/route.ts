import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { importBackup } from "@/lib/repo";
import { backupSchema } from "@/lib/schemas";

/** 从 JSON 备份恢复（合并，不会删除现有数据） */
export const POST = route(async (req) => importBackup(getDb(), await readJson(req, backupSchema)));
