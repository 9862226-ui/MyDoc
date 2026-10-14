import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { viewCreateSchema, viewsSchema } from "@/lib/schemas";
import { addView, listViews, setViews } from "@/lib/views-repo";

/** 保存的视图（常用筛选） */
export const GET = route(async () => listViews(getDb()));

export const POST = route(async (req) => addView(getDb(), await readJson(req, viewCreateSchema)));

/** 改名、删除、排序：整体替换 */
export const PUT = route(async (req) => setViews(getDb(), (await readJson(req, viewsSchema)).views));
