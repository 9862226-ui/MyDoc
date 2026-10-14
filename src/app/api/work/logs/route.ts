import { readJson, route } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { getDb } from "@/lib/db";
import { workLogCreateSchema } from "@/lib/schemas";
import { createWorkLogs } from "@/lib/worklog-repo";

export const POST = route(async (req) => {
  const { contents, detail, ...rest } = await readJson(req, workLogCreateSchema);
  if (detail.trim() && contents.length > 1) throw new HttpError(400, "写了明细时，一次只能添加一条");
  return createWorkLogs(
    getDb(),
    contents.map((content) => ({ ...rest, content, detail: detail.trim() ? detail : "" })),
  );
});
