import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { updateLink } from "@/lib/repo";

/** 应用归类结果：设置项目和标签（标签整体替换，撤销时用原来的值再调一次） */
export const POST = route(async (req) => {
  const { items } = await readJson(
    req,
    z.object({
      items: z
        .array(
          z.object({
            id: z.number().int().positive(),
            projectId: z.number().int().positive().nullable(),
            tags: z.array(z.string().max(30)).max(30),
          }),
        )
        .min(1)
        .max(200),
    }),
  );
  const db = getDb();
  db.transaction(() => {
    for (const it of items) updateLink(db, it.id, { projectId: it.projectId, tags: it.tags });
  })();
  return { updated: items.length };
});
