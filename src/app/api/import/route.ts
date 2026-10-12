import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { fetchTitle } from "@/lib/fetch-title";
import { fallbackTitle } from "@/lib/platforms";
import { importLinks } from "@/lib/repo";
import { importSchema } from "@/lib/schemas";

/** 最多同时获取几个网页标题 */
const CONCURRENCY = 6;
/** 一次导入最多自动获取多少个标题，避免请求太久 */
const MAX_FETCH = 100;

export const POST = route(async (req) => {
  const { items, projectId, tags, fetchTitles } = await readJson(req, importSchema);
  if (fetchTitles) {
    const missing = items.filter((i) => !i.title).slice(0, MAX_FETCH);
    let next = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < missing.length) {
          const item = missing[next++];
          item.title = await fetchTitle(item.url, 5000);
        }
      }),
    );
  }
  for (const item of items) item.title ||= fallbackTitle(item.url);
  return importLinks(getDb(), items, { projectId, tags });
});
