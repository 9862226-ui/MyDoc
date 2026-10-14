import { route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getWorkAll } from "@/lib/worklog-repo";

/** 全部工作记录：日历、周报列表、检索用 */
export const GET = route(() => getWorkAll(getDb()));
