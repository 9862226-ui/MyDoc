import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createGroup } from "@/lib/repo";
import { groupSchema } from "@/lib/schemas";

export const POST = route(async (req) => {
  const { name } = await readJson(req, groupSchema);
  return createGroup(getDb(), name);
});
