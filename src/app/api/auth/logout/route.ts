import { cookies } from "next/headers";
import { route } from "@/lib/api";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const POST = route(
  async () => {
    const store = await cookies();
    deleteSession(getDb(), store.get(SESSION_COOKIE)?.value);
    store.delete(SESSION_COOKIE);
    return { ok: true };
  },
  { public: true },
);
