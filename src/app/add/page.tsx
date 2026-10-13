import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { QuickAdd } from "@/components/QuickAdd";
import { isAuthenticated } from "@/lib/auth";
import { parseSharedContent } from "@/lib/share-text";

export const metadata = { title: "收藏到 MyDoc" };

type Params = { url?: string; title?: string; note?: string; text?: string };

/**
 * 收藏页：浏览器「收藏到 MyDoc」按钮、手机「分享」（安卓）和快捷指令（iPhone）都打开这里，
 * 直接弹出添加窗口，网址、标题、提取码已填好。
 */
export default async function AddPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { url = "", title = "", note = "", text = "" } = params;
  if (!(await isAuthenticated())) {
    const query = new URLSearchParams(Object.entries({ url, title, note, text }).filter(([, v]) => v)).toString();
    redirect(`/login?next=${encodeURIComponent(`/add?${query}`)}`);
  }
  const shared = parseSharedContent({ url: url.slice(0, 2000), title: title.slice(0, 200), text: text.slice(0, 5000) });
  return (
    <AppShell>
      <QuickAdd
        url={shared.url || url.slice(0, 2000)}
        title={shared.title}
        accessCode={shared.accessCode}
        note={[note.slice(0, 1000), shared.note].filter(Boolean).join("\n")}
      />
    </AppShell>
  );
}
