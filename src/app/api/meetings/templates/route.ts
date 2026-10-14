import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { listMeetingTemplates, setMeetingTemplates } from "@/lib/meeting-repo";
import { meetingTemplatesSchema } from "@/lib/schemas";

/** 自己存的纪要模板（内置的模板在 lib/meetings 里） */
export const GET = route(async () => listMeetingTemplates(getDb()));

export const PUT = route(async (req) =>
  setMeetingTemplates(getDb(), (await readJson(req, meetingTemplatesSchema)).templates),
);
