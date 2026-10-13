"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { trackVisit, useAppData } from "@/lib/client";
import { search } from "@/lib/view";
import { LinksView } from "./LinksView";

/**
 * 地址栏搜索的结果。只有一个结果时直接打开：
 * 链接不带提取码就跳过去（带提取码的要点一下，才能自动复制提取码）；只对上一个项目就进入项目。
 */
export function SearchResults({ q }: { q: string }) {
  const { data } = useAppData();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const result = useMemo(() => (data ? search(data, q, 2) : null), [data, q]);

  useEffect(() => {
    if (!result || leaving) return;
    const [link] = result.links;
    if (result.links.length === 1 && !link.accessCode) {
      setLeaving(true);
      trackVisit(link.id);
      window.location.replace(link.url);
    } else if (result.links.length === 0 && result.projects.length === 1) {
      setLeaving(true);
      router.replace(`/p/${result.projects[0].project.id}`);
    }
  }, [result, leaving, router]);

  if (leaving) {
    return <p className="px-8 py-10 text-center text-muted">正在打开……</p>;
  }
  return <LinksView view={{ kind: "search", q }} />;
}
