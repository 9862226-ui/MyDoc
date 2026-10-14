import { idParam, route } from "@/lib/api";
import { getAttachment, readAttachmentFile } from "@/lib/attachment-repo";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

/** 只有这些直接在浏览器里显示，其他的都下载（防止上传的网页、脚本在本站打开） */
const INLINE = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf)$/;

export const GET = route(async (req, ctx: Ctx) => {
  const a = getAttachment(getDb(), await idParam(ctx));
  const data = a && readAttachmentFile(a);
  if (!a || !data) throw new HttpError(404, "附件不存在");
  const inline = INLINE.test(a.mime) && !new URL(req.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "content-type": a.mime,
    "content-length": String(data.length),
    "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
    "x-content-type-options": "nosniff",
    // 同一个 id 的内容不会变
    "cache-control": "private, max-age=31536000, immutable",
  };
  // PDF 用浏览器自带的阅读器，加了 sandbox 会打不开；其他类型一律隔离
  if (a.mime !== "application/pdf") headers["content-security-policy"] = "sandbox; default-src 'none'; img-src 'self'";
  return new Response(new Uint8Array(data), { headers });
});
