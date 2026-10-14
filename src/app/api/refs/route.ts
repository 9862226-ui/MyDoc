import { route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { searchRefTargets } from "@/lib/refs-repo";

/** 插入引用时搜索可以引用的内容：GET /api/refs?q=切片 */
export const GET = route(async (req) => searchRefTargets(getDb(), new URL(req.url).searchParams.get("q") ?? ""));
