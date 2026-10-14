"use client";

import { ChevronDown, CornerDownRight } from "lucide-react";
import NextLink from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, BACKLINKS_KEY } from "@/lib/client";
import { REF_LABEL, refHref, refKey, type RefSource, type RefType } from "@/lib/refs";
import { cx } from "./ui";

/** 所有反向链接，按「被引用的内容」查 */
export function useBacklinks() {
  return useSWR(BACKLINKS_KEY, (url: string) => api<Record<string, RefSource[]>>(url));
}

const mmdd = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;

/** 引用了某条内容的地方 */
export function BacklinkList({ sources, className }: { sources: RefSource[]; className?: string }) {
  return (
    <ul className={cx("flex flex-col gap-0.5", className)}>
      {sources.map((s) => (
        <li key={`${s.type}:${s.id}`}>
          <NextLink
            href={refHref(s.type, s.id)}
            className="flex items-start gap-1.5 rounded px-1 py-0.5 text-[13px] hover:bg-hover"
          >
            <CornerDownRight size={13} className="mt-1 shrink-0 text-icon" />
            <span className="shrink-0 text-xs leading-5 text-faint">
              {[REF_LABEL[s.type], s.date && mmdd(s.date)].filter(Boolean).join(" · ")}
            </span>
            <span className="min-w-0 break-words">{s.title}</span>
          </NextLink>
        </li>
      ))}
    </ul>
  );
}

/** 小按钮「被引用 2」，点开列出来；没有被引用时不显示 */
export function BacklinkToggle({ type, id, label = "被引用" }: { type: RefType; id: number; label?: string }) {
  const { data } = useBacklinks();
  const [open, setOpen] = useState(false);
  const sources = data?.[refKey(type, id)] ?? [];
  if (!sources.length) return null;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-0.5 text-accent-text hover:underline"
      >
        {label} {sources.length}
        <ChevronDown size={12} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      {open && <BacklinkList sources={sources} className="mt-1 w-full basis-full" />}
    </>
  );
}
