import { idParam, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteMeeting, updateMeeting } from "@/lib/meeting-repo";
import { meetingPatchSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, ctx: Ctx) =>
  updateMeeting(getDb(), await idParam(ctx), await readJson(req, meetingPatchSchema)),
);

/** 删除，返回被删的纪要（页面上「撤销」时用它重新创建） */
export const DELETE = route(async (_req, ctx: Ctx) => deleteMeeting(getDb(), await idParam(ctx)));
