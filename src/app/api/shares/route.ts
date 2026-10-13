import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createShare, listShares } from "@/lib/shares";

export const dynamic = "force-dynamic";

/** 分享列表；带 projectId 时只看这个项目的 */
export const GET = route((req) => {
  const pid = new URL(req.url).searchParams.get("projectId");
  return listShares(getDb(), pid ? Number(pid) : undefined);
});

export const POST = route(async (req) => {
  const input = await readJson(
    req,
    z.object({
      projectId: z.number().int().positive(),
      days: z.number().int().min(1).max(3650).nullable(),
      password: z.string().trim().max(64, "密码不能超过 64 个字").default(""),
      showNotes: z.boolean().default(false),
    }),
  );
  return createShare(getDb(), input);
});
