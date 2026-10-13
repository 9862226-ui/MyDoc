import { idParam, readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteReminder, updateReminder } from "@/lib/reminder-repo";
import { reminderPatchSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, ctx: Ctx) =>
  updateReminder(getDb(), await idParam(ctx), await readJson(req, reminderPatchSchema)),
);

export const DELETE = route(async (_req, ctx: Ctx) => {
  deleteReminder(getDb(), await idParam(ctx));
});
