import { route } from "@/lib/api";
import { attachmentStats, attachmentUrl, saveAttachment } from "@/lib/attachment-repo";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";

/** 附件数量、占用空间、没用到的有多少 */
export const GET = route(async () => attachmentStats(getDb()));

/** 上传一个附件（表单字段 file），返回插入正文用的地址 */
export const POST = route(async (req) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "请选择要上传的文件");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "请选择要上传的文件");
  const a = saveAttachment(getDb(), { name: file.name, mime: file.type, data: Buffer.from(await file.arrayBuffer()) });
  return { id: a.id, name: a.name, mime: a.mime, size: a.size, url: attachmentUrl(a.id) };
});
