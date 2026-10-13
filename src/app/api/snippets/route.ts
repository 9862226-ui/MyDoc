import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createSnippet } from "@/lib/snippet-repo";
import { snippetCreateSchema } from "@/lib/schemas";

export const POST = route(async (req) => createSnippet(getDb(), await readJson(req, snippetCreateSchema)));
