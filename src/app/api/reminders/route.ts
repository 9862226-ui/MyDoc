import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createReminder, listReminders } from "@/lib/reminder-repo";
import { reminderCreateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export const GET = route(() => listReminders(getDb()));

export const POST = route(async (req) => createReminder(getDb(), await readJson(req, reminderCreateSchema)));
