import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SearchResults } from "@/components/SearchResults";
import { isAuthenticated } from "@/lib/auth";

export const metadata = { title: "搜索 · MyDoc" };

/** 浏览器地址栏搜索打开的页面：/search?q=关键词 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim().slice(0, 200) ?? "";
  if (!q) redirect("/");
  if (!(await isAuthenticated())) redirect(`/login?next=${encodeURIComponent(`/search?q=${encodeURIComponent(q)}`)}`);
  return (
    <AppShell>
      <SearchResults q={q} />
    </AppShell>
  );
}
