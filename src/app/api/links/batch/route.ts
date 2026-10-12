import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { batchLinks } from "@/lib/repo";
import { batchSchema } from "@/lib/schemas";

export const POST = route(async (req) => {
  const { ids, op } = await readJson(req, batchSchema);
  batchLinks(getDb(), ids, op);
});
