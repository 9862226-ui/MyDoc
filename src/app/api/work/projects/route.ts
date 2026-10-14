import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { workProjectCreateSchema } from "@/lib/schemas";
import { createWorkProject } from "@/lib/worklog-repo";

export const POST = route(async (req) => createWorkProject(getDb(), await readJson(req, workProjectCreateSchema)));
