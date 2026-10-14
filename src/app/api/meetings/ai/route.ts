import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { organizeMeeting } from "@/lib/meeting-ai";
import { meetingAiSchema } from "@/lib/schemas";

/** AI 把会议文字稿整理成纪要（只返回结果，不保存） */
export const POST = route(async (req) => {
  const input = await readJson(req, meetingAiSchema);
  try {
    return await organizeMeeting(getDb(), input);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
