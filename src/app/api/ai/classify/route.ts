import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { classifyLinks, MAX_CLASSIFY } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";

/** 让 AI 给链接出归类建议（只返回建议，不修改数据） */
export const POST = route(async (req) => {
  const { ids } = await readJson(req, z.object({ ids: z.array(z.number().int().positive()).min(1).max(MAX_CLASSIFY) }));
  try {
    return { suggestions: await classifyLinks(getDb(), ids) };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
