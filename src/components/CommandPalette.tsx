"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAppData } from "@/lib/client";
import { platformLabel } from "@/lib/platforms";
import type { Link } from "@/lib/types";
import { pinyinHits, projectIndex, projectPathLabel, search, type ProjectInfo } from "@/lib/view";
import { cx, DocIcon, Kbd, ProjectBadge, useModKey } from "./ui";
import { useLinkActions } from "./ui-context";

type Item = { type: "link"; link: Link } | { type: "project"; info: ProjectInfo };
type Scope = "all" | "links" | "projects";

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
      aria-label="搜索"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="mx-auto mt-[4dvh] w-[calc(100%-24px)] max-w-[680px] overflow-hidden rounded-xl border-0 bg-menu p-0 shadow-dialog open:animate-[dialog-in_160ms_ease-out] sm:mt-[12dvh]"
    >
      {open && <PaletteBody onClose={onClose} />}
    </dialog>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 把匹配到的关键字标成主色；用拼音对上的字也标出来（py 是 text 的拼音） */
function highlight(text: string, query: string, py?: string): ReactNode {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return text;
  const marked = pinyinHits(text, py, terms);
  const re = new RegExp(terms.map(escapeRegExp).join("|"), "gi");
  for (const m of text.matchAll(re)) for (let i = m.index; i < m.index + m[0].length; i++) marked.add(i);
  const parts: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && marked.has(j) === marked.has(i)) j++;
    const part = text.slice(i, j);
    parts.push(
      marked.has(i) ? (
        <mark key={i} className="bg-transparent font-medium text-accent-text">
          {part}
        </mark>
      ) : (
        part
      ),
    );
    i = j;
  }
  return parts;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const { data } = useAppData();
  const router = useRouter();
  const actions = useLinkActions();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const mod = useModKey();

  const index = useMemo(() => (data ? projectIndex(data) : new Map<number, ProjectInfo>()), [data]);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of data?.links ?? []) if (l.projectId !== null) m.set(l.projectId, (m.get(l.projectId) ?? 0) + 1);
    return m;
  }, [data]);

  const result = useMemo(() => (data && query.trim() ? search(data, query) : null), [data, query]);

  const sections = useMemo(() => {
    if (!data) return [];
    if (!result) {
      const recent = data.links
        .filter((l) => l.lastVisitedAt)
        .sort((a, b) => b.lastVisitedAt!.localeCompare(a.lastVisitedAt!))
        .slice(0, 8);
      const recentIds = new Set(recent.map((l) => l.id));
      const favorites = data.links.filter((l) => l.favorite && !recentIds.has(l.id)).slice(0, 6);
      return [
        { title: "最近访问", items: recent.map((link): Item => ({ type: "link", link })) },
        { title: "收藏", items: favorites.map((link): Item => ({ type: "link", link })) },
      ].filter((s) => s.items.length);
    }
    return [
      {
        title: "项目",
        items: scope === "links" ? [] : result.projects.map((info): Item => ({ type: "project", info })),
      },
      { title: "链接", items: scope === "projects" ? [] : result.links.map((link): Item => ({ type: "link", link })) },
    ].filter((s) => s.items.length);
  }, [data, result, scope]);

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

  const scopes: [Scope, string][] = result
    ? [
        ["all", `全部 ${result.links.length + result.projects.length}`],
        ["links", `链接 ${result.links.length}`],
        ["projects", `项目 ${result.projects.length}`],
      ]
    : [];

  let i = -1;
  return (
    <div className="flex max-h-[min(80dvh,720px)] flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line pr-4 pl-[18px]">
        <Search size={20} className="shrink-0 text-muted" />
        <input
          data-autofocus
          value={query}
          aria-label="搜索文档、项目、标签"
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
            } else if (e.key === "Tab" && scopes.length) {
              // Tab 切换「全部 / 链接 / 项目」
              e.preventDefault();
              const at = scopes.findIndex(([k]) => k === scope);
              setScope(scopes[(at + (e.shiftKey ? scopes.length - 1 : 1)) % scopes.length][0]);
              setActive(0);
            }
          }}
          placeholder="搜索文档、项目、标签"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-icon"
        />
        <button type="button" onClick={onClose} aria-label="关闭搜索" className="cursor-pointer">
          <Kbd className="h-5">Esc</Kbd>
        </button>
      </div>

      {scopes.length > 0 && (
        <div role="tablist" aria-label="搜索范围" className="flex shrink-0 gap-5 border-b border-line-soft px-[18px]">
          {scopes.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scope === key}
              tabIndex={-1}
              onClick={() => {
                setScope(key);
                setActive(0);
              }}
              className={cx(
                "h-10 cursor-pointer text-[13px]",
                scope === key
                  ? "font-semibold text-fg shadow-[inset_0_-2px_0_var(--accent)]"
                  : "text-muted hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {!data ? null : flat.length === 0 ? (
          <p className="px-4 py-12 text-center text-faint">
            {query.trim()
              ? `没有找到和「${query.trim()}」相关的${scope === "projects" ? "项目" : "文档"}，换个关键字试试`
              : "输入关键字搜索，多个关键字用空格分开"}
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.title}>
              <div className="px-2.5 pt-2.5 pb-1 text-xs text-faint">{section.title}</div>
              {section.items.map((item) => {
                i++;
                const idx = i;
                const selected = idx === current;
                return (
                  <button
                    key={item.type === "link" ? `l${item.link.id}` : `p${item.info.project.id}`}
                    type="button"
                    data-index={idx}
                    aria-selected={selected}
                    onMouseMove={() => setActive(idx)}
                    onClick={() => choose(item)}
                    className={cx(
                      "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                      selected && "bg-field",
                    )}
                  >
                    {item.type === "link" ? (
                      <>
                        <DocIcon url={item.link.url} size={32} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{highlight(item.link.title, query, item.link.py)}</span>
                          <span className="truncate text-xs leading-5 text-faint">
                            {projectPathLabel(
                              item.link.projectId === null ? undefined : index.get(item.link.projectId),
                            )}
                            {" · "}
                            {platformLabel(item.link.url)}
                          </span>
                        </span>
                        {item.link.accessCode && (
                          <span className="shrink-0 rounded border border-line-strong px-1.5 font-mono text-xs leading-5 text-muted">
                            {item.link.accessCode}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <ProjectBadge project={item.info.project} size={32} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">
                            {highlight(item.info.project.name, query, item.info.project.py)}
                          </span>
                          <span className="truncate text-xs leading-5 text-faint">
                            {[
                              item.info.group?.name,
                              `${counts.get(item.info.project.id) ?? 0} 个链接`,
                              item.info.project.archived && "已归档",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </>
                    )}
                    {selected && (
                      <span className="shrink-0 text-xs text-faint max-sm:hidden">
                        ↵ {item.type === "project" ? "进入" : "打开"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="hidden shrink-0 flex-wrap items-center gap-4 border-t border-line-soft bg-side px-[18px] py-2.5 text-xs text-faint sm:flex">
        <span>↑ ↓ 选择</span>
        <span>↵ 打开</span>
        <span>{mod} ↵ 复制链接</span>
        {scopes.length > 0 && <span>Tab 切换范围</span>}
        <span>Esc 关闭</span>
        <span className="flex-1 text-right">打开带提取码的链接时，会自动复制提取码</span>
      </div>
    </div>
  );
}
