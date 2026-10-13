import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SharedProjectView, ShareGone, SharePassword } from "@/components/SharePage";
import { getDb } from "@/lib/db";
import { findShare, isUnlocked, recordShareView, shareCookieName, sharedProject } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = findShare(getDb(), (await params).token);
  return {
    title: found ? `${found.share.projectName} · MyDoc 分享` : "分享链接已失效 · MyDoc",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/** 项目的只读分享页：不需要登录 */
export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const db = getDb();
  const found = findShare(db, token);
  if (!found) return <ShareGone />;
  const cookie = (await cookies()).get(shareCookieName(found.row.id))?.value;
  if (!isUnlocked(found.row, cookie)) return <SharePassword token={token} projectName={found.share.projectName} />;
  recordShareView(db, found.row.id);
  return <SharedProjectView data={sharedProject(db, found.row)} />;
}
