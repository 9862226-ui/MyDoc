import { route } from "@/lib/api";
import { cleanupAttachments } from "@/lib/attachment-repo";
import { getDb } from "@/lib/db";

/** 删掉没有用到的附件 */
export const POST = route(async () => cleanupAttachments(getDb()));
