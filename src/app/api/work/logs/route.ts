import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { workLogCreateSchema } from "@/lib/schemas";
import { createWorkLogs } from "@/lib/worklog-repo";

export const POST = route(async (req) => {
  const { contents, ...rest } = await readJson(req, workLogCreateSchema);
  return createWorkLogs(
    getDb(),
    contents.map((content) => ({ ...rest, content })),
  );
});
