import { route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getAppData } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const GET = route(() => getAppData(getDb()));
