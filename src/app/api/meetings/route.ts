import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createMeeting, listMeetings } from "@/lib/meeting-repo";
import { meetingCreateSchema } from "@/lib/schemas";

export const GET = route(() => listMeetings(getDb()));

export const POST = route(async (req) => createMeeting(getDb(), await readJson(req, meetingCreateSchema)));
