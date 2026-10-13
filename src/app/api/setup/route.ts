import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getSetupStatus, updateSetup } from "@/lib/setup";

export const dynamic = "force-dynamic";

/** 工作台「设置清单」的完成情况 */
export const GET = route(() => getSetupStatus(getDb()));

export const PUT = route(async (req) => {
  const patch = await readJson(
    req,
    z.object({
      manual: z.object({ bookmarklet: z.boolean(), mobile: z.boolean() }).partial().optional(),
      dismissed: z.boolean().optional(),
    }),
  );
  return updateSetup(getDb(), patch);
});
