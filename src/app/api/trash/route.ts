import { route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { emptyTrash, getTrash } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const GET = route(() => getTrash(getDb()));

export const DELETE = route(() => {
  emptyTrash(getDb());
});
