import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createProject } from "@/lib/repo";
import { projectCreateSchema } from "@/lib/schemas";

export const POST = route(async (req) => createProject(getDb(), await readJson(req, projectCreateSchema)));
