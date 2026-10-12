import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { reorderGroups, reorderProjects } from "@/lib/repo";
import { reorderSchema } from "@/lib/schemas";

export const POST = route(async (req) => {
  const body = await readJson(req, reorderSchema);
  if (body.kind === "groups") reorderGroups(getDb(), body.ids);
  else reorderProjects(getDb(), body.groupId, body.ids);
});
