import { route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { backlinks } from "@/lib/refs-repo";

/** 所有反向链接（被引用的内容 → 引用了它的内容） */
export const GET = route(async () => backlinks(getDb()));
