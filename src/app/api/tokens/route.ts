import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createToken, listTokens } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export const GET = route(() => listTokens(getDb()));

/** 新建访问令牌；明文只在这次返回 */
export const POST = route(async (req) => {
  const { name } = await readJson(
    req,
    z.object({ name: z.string().trim().min(1, "名称不能为空").max(40, "名称不能超过 40 个字") }),
  );
  return createToken(getDb(), name);
});
