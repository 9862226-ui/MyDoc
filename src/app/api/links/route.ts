import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { fallbackTitle } from "@/lib/platforms";
import { createLink } from "@/lib/repo";
import { linkCreateSchema } from "@/lib/schemas";

export const POST = route(async (req) => {
  const input = await readJson(req, linkCreateSchema);
  return createLink(getDb(), { ...input, title: input.title || fallbackTitle(input.url) });
});
