import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { fetchTitle } from "@/lib/fetch-title";
import { urlSchema } from "@/lib/schemas";

export const POST = route(async (req) => {
  const { url } = await readJson(req, z.object({ url: urlSchema }));
  return { title: await fetchTitle(url) };
});
