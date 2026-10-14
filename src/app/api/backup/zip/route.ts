import { route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { importZip } from "@/lib/full-backup";

/** 从完整备份（ZIP）恢复：请求体就是 ZIP 文件 */
export const POST = route(async (req) => {
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/(zip|x-zip-compressed|octet-stream)/.test(type)) throw new HttpError(415, "请选择 ZIP 文件");
  return importZip(getDb(), Buffer.from(await req.arrayBuffer()));
});
