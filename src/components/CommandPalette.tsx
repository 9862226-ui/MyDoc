"use client";

import { FolderOpen, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "@/lib/client";
import { platformLabel } from "@/lib/platforms";
import type { Link } from "@/lib/types";
import { projectIndex, projectPathLabel, search, type ProjectInfo } from "@/lib/view";
import { cx, Kbd, PlatformIcon, useModKey } from "./ui";
import { useLinkActions } from "./ui-context";

type Item = { type: "link"; link: Link } | { type: "project"; info: ProjectInfo };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-palette
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="mx-auto mt-[10dvh] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-xl border border-line bg-surface p-0 shadow-2xl"
    >
      {open && <PaletteBody onClose={onClose} />}
    </dialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const { data } = useAppData();
  const router = useRouter();
  const actions = useLinkActions();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const mod = useModKey();

  const index = useMemo(() => (data ? projectIndex(data) : new Map<number, ProjectInfo>()), [data]);

  const sections = useMemo(() => {
    if (!data) return [];
    if (!query.trim()) {
      const recent = data.links
        .filter((l) => l.lastVisitedAt)
        .sort((a, b) => b.lastVisitedAt!.localeCompare(a.lastVisitedAt!))
        .slice(0, 8);
      const recentIds = new Set(recent.map((l) => l.id));
      const favorites = data.links.filter((l) => (l.favorite || l.pinned) && !recentIds.has(l.id)).slice(0, 8);
      return [
        { title: "最近访问", items: recent.map((link): Item => ({ type: "link", link })) },
        { title: "收藏", items: favorites.map((link): Item => ({ type: "link", link })) },
      ].filter((s) => s.items.length);
    }
    const r = search(data, query);
    return [
      { title: "项目", items: r.projects.map((info): Item => ({ type: "project", info })) },
      { title: "链接", items: r.links.map((link): Item => ({ type: "link", link })) },
    ].filter((s) => s.items.length);
  }, [data, query]);

  const flat = sections.flatMap((s) => s.items);
  const current = Math.min(active, flat.length - 1);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const choose = (item: Item, copy = false) => {
    onClose();
    if (item.type === "project") router.push(`/p/${item.info.project.id}`);
    else if (copy) void actions.copy(item.link);
    else actions.open(item.link);
  };

  let i = -1;
  return (
    <div className="flex max-h-[70dvh] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search size={18} className="shrink-0 text-muted" />
        <input
          data-autofocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, flat.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && flat[current]) {
              e.preventDefault();
              choose(flat[current], e.metaKey || e.ctrlKey);
            }
          }}
          placeholder="搜索文档标题、项目、标签、备注…"
          className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
        />
        <Kbd>Esc</Kbd>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {!data ? null : flat.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted">
            {query.trim() ? "没有找到匹配的文档" : "输入关键字搜索，多个关键字用空格分开"}
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.title} className="mb-1">
              <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted">{section.title}</div>
              {section.items.map((item) => {
                i++;
                const idx = i;
                const selected = idx === current;
                return (
                  <button
                    key={item.type === "link" ? `l${item.link.id}` : `p${item.info.project.id}`}
                    type="button"
                    data-index={idx}
                    onMouseMove={() => setActive(idx)}
                    onClick={() => choose(item)}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
                      selected && "bg-accent-soft",
                    )}
                  >
                    {item.type === "link" ? (
                      <>
                        <PlatformIcon url={item.link.url} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.link.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {projectPathLabel(item.link.projectId === null ? undefined : index.get(item.link.projectId))}
                            {" · "}
                            {platformLabel(item.link.url)}
                          </span>
                        </span>
                        {item.link.accessCode && (
                          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">
                            {item.link.accessCode}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted">
                          <FolderOpen size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.info.project.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {item.info.group?.name}
                            {item.info.project.archived && " · 已归档"}
                          </span>
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-xs text-muted sm:flex">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> 选择
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> 打开
        </span>
        <span className="flex items-center gap-1">
          <Kbd>{mod}</Kbd>
          <Kbd>↵</Kbd> 复制链接
        </span>
        <span className="ml-auto">打开带提取码的链接时会自动复制提取码</span>
      </div>
    </div>
  );
}
