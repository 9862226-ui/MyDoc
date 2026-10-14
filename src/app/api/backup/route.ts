import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { restoreJson } from "@/lib/full-backup";
import { z } from "zod";

/** 从 JSON 备份恢复（合并，不会删除现有数据） */
export const POST = route(async (req) => restoreJson(getDb(), await readJson(req, z.unknown())));
