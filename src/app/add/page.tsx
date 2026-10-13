import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { QuickAdd } from "@/components/QuickAdd";
import { isAuthenticated } from "@/lib/auth";

export const metadata = { title: "收藏到 MyDoc" };

type Params = { url?: string; title?: string; note?: string };

/** 浏览器「收藏到 MyDoc」按钮打开的页面：直接弹出添加窗口，网址和标题已填好 */
export default async function AddPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { url = "", title = "", note = "" } = await searchParams;
  if (!(await isAuthenticated())) {
    const query = new URLSearchParams({ url, title, note }).toString();
    redirect(`/login?next=${encodeURIComponent(`/add?${query}`)}`);
  }
  return (
    <AppShell>
      <QuickAdd url={url.slice(0, 2000)} title={title.slice(0, 200)} note={note.slice(0, 1000)} />
    </AppShell>
  );
}
