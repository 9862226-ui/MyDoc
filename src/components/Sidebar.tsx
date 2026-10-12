"use client";

import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  ChevronRight,
  Clock,
  FolderPlus,
  Hash,
  House,
  Inbox,
  Layers,
  LogOut,
  Pencil,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { api, readLocal, refreshData, useAppData, writeLocal } from "@/lib/client";
import type { Group, Project } from "@/lib/types";
import { safeDecode } from "@/lib/url";
import { isExpiring } from "@/lib/view";
import { cx, IconButton, Kbd, Menu, Spinner, useModKey } from "./ui";
import { useLinkActions, useUI } from "./ui-context";

export const LINKS_MIME = "application/x-mydoc-links";
const PROJECT_MIME = "application/x-mydoc-project";
const GROUP_MIME = "application/x-mydoc-group";

const hasType = (e: DragEvent, type: string) => e.dataTransfer.types.includes(type);

/** 拖动时的放置提示：放进去 / 插到前面 */
type DropHint = { key: string; mode: "into" | "before" } | null;

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useAppData();
  const pathname = usePathname();
  const router = useRouter();
  const ui = useUI();
  const actions = useLinkActions();
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [drop, setDrop] = useState<DropHint>(null);
  const mod = useModKey();

  useEffect(() => {
    setCollapsed(readLocal("mydoc.collapsed", {}));
    setShowArchived(readLocal("mydoc.showArchived", false));
    setTagsOpen(readLocal("mydoc.tagsOpen", true));
  }, []);

  const counts = useMemo(() => {
    const byProject = new Map<number, number>();
    const byTag = new Map<string, number>();
    let inbox = 0;
    let favorites = 0;
    let expiring = 0;
    for (const l of data?.links ?? []) {
      if (l.projectId === null) inbox++;
      else byProject.set(l.projectId, (byProject.get(l.projectId) ?? 0) + 1);
      if (l.favorite) favorites++;
      if (isExpiring(l)) expiring++;
      for (const t of l.tags) byTag.set(t.toLowerCase(), (byTag.get(t.toLowerCase()) ?? 0) + 1);
    }
    return { byProject, byTag, inbox, favorites, expiring, all: data?.links.length ?? 0 };
  }, [data]);

  const toggleGroup = (id: number) => {
    const next = { ...collapsed, [id]: !collapsed[id] };
    setCollapsed(next);
    writeLocal("mydoc.collapsed", next);
  };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refreshData();
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const projectsOf = (groupId: number) => (data?.projects ?? []).filter((p) => p.groupId === groupId);

  const reorderProjects = (groupId: number, draggedId: number, beforeId: number | null) => {
    const ids = projectsOf(groupId)
      .map((p) => p.id)
      .filter((id) => id !== draggedId);
    const at = beforeId === null ? ids.length : ids.indexOf(beforeId);
    ids.splice(at < 0 ? ids.length : at, 0, draggedId);
    void run(() => api("/api/reorder", { body: { kind: "projects", groupId, ids } }));
  };

  const reorderGroups = (draggedId: number, beforeId: number) => {
    const ids = (data?.groups ?? []).map((g) => g.id).filter((id) => id !== draggedId);
    ids.splice(ids.indexOf(beforeId), 0, draggedId);
    void run(() => api("/api/reorder", { body: { kind: "groups", ids } }));
  };

  const linkIds = (e: DragEvent): number[] => {
    try {
      return JSON.parse(e.dataTransfer.getData(LINKS_MIME)) as number[];
    } catch {
      return [];
    }
  };

  const dragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null);
  };

  const deleteGroup = async (g: Group) => {
    const n = projectsOf(g.id).length;
    const ok = await ui.confirm({
      title: `删除分组「${g.name}」？`,
      message: n
        ? `其中的 ${n} 个项目也会被删除，项目里的链接会移到收件箱，不会丢失。`
        : "这个分组是空的。",
      confirmText: "删除",
      danger: true,
    });
    if (ok) void run(() => api(`/api/groups/${g.id}`, { method: "DELETE" }));
  };

  const deleteProject = async (p: Project) => {
    const n = counts.byProject.get(p.id) ?? 0;
    const ok = await ui.confirm({
      title: `删除项目「${p.name}」？`,
      message: n ? `其中的 ${n} 个链接会移到收件箱，不会丢失。` : "这个项目是空的。",
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    if (pathname === `/p/${p.id}`) router.push("/inbox");
    void run(() => api(`/api/projects/${p.id}`, { method: "DELETE" }));
  };

  const setArchived = (p: Project, archived: boolean) =>
    run(async () => {
      await api(`/api/projects/${p.id}`, { method: "PATCH", body: { archived } });
      ui.toast(archived ? `已归档「${p.name}」，勾选侧边栏的「显示已归档」可以看到` : `已恢复「${p.name}」`);
    });

  const archivedCount = data?.projects.filter((p) => p.archived).length ?? 0;

  return (
    <nav
      className="flex h-full flex-col bg-surface"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) onNavigate?.();
      }}
    >
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2 px-1 py-1">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-accent-fg">
            M
          </span>
          <span className="text-[15px] font-semibold">MyDoc</span>
        </div>
        <button
          type="button"
          onClick={ui.openPalette}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-bg px-3 text-muted hover:border-accent/50"
        >
          <Search size={15} />
          <span className="flex-1 text-left">搜索…</span>
          <Kbd>{mod} K</Kbd>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <ul className="space-y-0.5">
          <NavItem href="/" icon={<House size={16} />} label="首页" active={pathname === "/"} />
          <NavItem
            href="/inbox"
            icon={<Inbox size={16} />}
            label="收件箱"
            count={counts.inbox}
            active={pathname === "/inbox"}
            dropActive={drop?.key === "inbox"}
            onDragOver={(e) => {
              if (!hasType(e, LINKS_MIME)) return;
              e.preventDefault();
              setDrop({ key: "inbox", mode: "into" });
            }}
            onDragLeave={dragLeave}
            onDrop={(e) => {
              e.preventDefault();
              setDrop(null);
              const ids = linkIds(e);
              if (ids.length) void actions.move(ids, null, "收件箱");
            }}
          />
          <NavItem href="/recent" icon={<Clock size={16} />} label="最近访问" active={pathname === "/recent"} />
          <NavItem
            href="/favorites"
            icon={<Star size={16} />}
            label="收藏"
            count={counts.favorites}
            active={pathname === "/favorites"}
          />
          {counts.expiring > 0 && (
            <NavItem
              href="/expiring"
              icon={<AlarmClock size={16} />}
              label="即将过期"
              count={counts.expiring}
              warn
              active={pathname === "/expiring"}
            />
          )}
          <NavItem href="/all" icon={<Layers size={16} />} label="全部链接" count={counts.all} active={pathname === "/all"} />
        </ul>

        <SectionTitle
          action={
            <IconButton label="新建分组" className="size-6" onClick={() => ui.editGroup()}>
              <FolderPlus size={15} />
            </IconButton>
          }
        >
          项目
        </SectionTitle>

        {!data ? (
          <div className="flex justify-center py-4 text-muted">
            <Spinner />
          </div>
        ) : data.groups.length === 0 ? (
          <button
            type="button"
            onClick={() => ui.editGroup()}
            className="w-full rounded-lg border border-dashed border-line px-3 py-3 text-left text-[13px] text-muted hover:border-accent/50 hover:text-fg"
          >
            还没有分组，点这里新建一个（例如「工作」「个人」）
          </button>
        ) : (
          <div className="space-y-1">
            {data.groups.map((g) => {
              const projects = projectsOf(g.id).filter((p) => showArchived || !p.archived);
              const open = !collapsed[g.id];
              const key = `g${g.id}`;
              return (
                <div key={g.id}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(GROUP_MIME, String(g.id));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (hasType(e, GROUP_MIME)) setDrop({ key, mode: "before" });
                      else if (hasType(e, PROJECT_MIME)) setDrop({ key, mode: "into" });
                      else return;
                      e.preventDefault();
                    }}
                    onDragLeave={dragLeave}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrop(null);
                      const groupId = Number(e.dataTransfer.getData(GROUP_MIME));
                      const projectId = Number(e.dataTransfer.getData(PROJECT_MIME));
                      if (groupId && groupId !== g.id) reorderGroups(groupId, g.id);
                      else if (projectId) reorderProjects(g.id, projectId, null);
                    }}
                    className={cx(
                      "group/row flex h-8 items-center rounded-md",
                      drop?.key === key && drop.mode === "before" && "shadow-[inset_0_2px_0_var(--accent)]",
                      drop?.key === key && drop.mode === "into" && "bg-accent-soft",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      aria-expanded={open}
                      className="flex h-full min-w-0 flex-1 items-center gap-1 px-1.5 text-left text-[13px] font-medium text-muted hover:text-fg"
                    >
                      <ChevronRight size={14} className={cx("shrink-0 transition-transform", open && "rotate-90")} />
                      <span className="truncate">{g.name}</span>
                    </button>
                    <span className="flex opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                      <IconButton label="新建项目" className="size-7" onClick={() => ui.editProject(undefined, g.id)}>
                        <Plus size={15} />
                      </IconButton>
                      <Menu
                        className="size-7"
                        label="分组操作"
                        items={[
                          { label: "新建项目", icon: <Plus size={14} />, onSelect: () => ui.editProject(undefined, g.id) },
                          { label: "重命名", icon: <Pencil size={14} />, onSelect: () => ui.editGroup(g) },
                          { divider: true },
                          { label: "删除分组", icon: <Trash2 size={14} />, danger: true, onSelect: () => void deleteGroup(g) },
                        ]}
                      />
                    </span>
                  </div>

                  {open && (
                    <ul className="space-y-0.5">
                      {projects.map((p) => {
                        const pkey = `p${p.id}`;
                        const active = pathname === `/p/${p.id}`;
                        return (
                          <li key={p.id} className="group/proj relative">
                            <NextLink
                              href={`/p/${p.id}`}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData(PROJECT_MIME, String(p.id));
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragOver={(e) => {
                                if (hasType(e, LINKS_MIME)) setDrop({ key: pkey, mode: "into" });
                                else if (hasType(e, PROJECT_MIME)) setDrop({ key: pkey, mode: "before" });
                                else return;
                                e.preventDefault();
                              }}
                              onDragLeave={dragLeave}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDrop(null);
                                const ids = linkIds(e);
                                const dragged = Number(e.dataTransfer.getData(PROJECT_MIME));
                                if (ids.length) void actions.move(ids, p.id, p.name);
                                else if (dragged && dragged !== p.id) reorderProjects(g.id, dragged, p.id);
                              }}
                              className={cx(
                                "flex h-8 items-center gap-2 rounded-md pr-2 pl-6 text-[13px]",
                                active ? "bg-accent-soft font-medium text-accent" : "hover:bg-surface-2",
                                p.archived && "text-muted",
                                drop?.key === pkey && drop.mode === "into" && "bg-accent-soft ring-1 ring-accent",
                                drop?.key === pkey && drop.mode === "before" && "shadow-[inset_0_2px_0_var(--accent)]",
                              )}
                            >
                              {p.archived ? (
                                <Archive size={14} className="shrink-0 opacity-70" />
                              ) : (
                                <span className="size-1.5 shrink-0 rounded-full bg-current opacity-40" />
                              )}
                              <span className="min-w-0 flex-1 truncate">{p.name}</span>
                              <span className="text-xs text-muted tabular-nums group-hover/proj:invisible">
                                {counts.byProject.get(p.id) || ""}
                              </span>
                            </NextLink>
                            <span className="absolute top-1/2 right-0.5 -translate-y-1/2 opacity-0 group-hover/proj:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                              <Menu
                                className="size-7"
                                label="项目操作"
                                items={[
                                  { label: "编辑项目", icon: <Pencil size={14} />, onSelect: () => ui.editProject(p) },
                                  p.archived
                                    ? {
                                        label: "取消归档",
                                        icon: <ArchiveRestore size={14} />,
                                        onSelect: () => void setArchived(p, false),
                                      }
                                    : { label: "归档", icon: <Archive size={14} />, onSelect: () => void setArchived(p, true) },
                                  { divider: true },
                                  {
                                    label: "删除项目",
                                    icon: <Trash2 size={14} />,
                                    danger: true,
                                    onSelect: () => void deleteProject(p),
                                  },
                                ]}
                              />
                            </span>
                          </li>
                        );
                      })}
                      {projects.length === 0 && (
                        <li>
                          <button
                            type="button"
                            onClick={() => ui.editProject(undefined, g.id)}
                            className="flex h-8 w-full items-center gap-2 rounded-md pl-6 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
                          >
                            <Plus size={14} /> 新建项目
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
            {archivedCount > 0 && (
              <label className="flex cursor-pointer items-center gap-2 px-1.5 pt-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => {
                    setShowArchived(e.target.checked);
                    writeLocal("mydoc.showArchived", e.target.checked);
                  }}
                  className="accent-[var(--accent)]"
                />
                显示已归档的项目（{archivedCount}）
              </label>
            )}
          </div>
        )}

        {data && data.tags.length > 0 && (
          <>
            <SectionTitle
              onClick={() => {
                setTagsOpen(!tagsOpen);
                writeLocal("mydoc.tagsOpen", !tagsOpen);
              }}
              open={tagsOpen}
            >
              标签
            </SectionTitle>
            {tagsOpen && (
              <ul className="space-y-0.5">
                {data.tags.map((t) => {
                  const href = `/t/${encodeURIComponent(t.name)}`;
                  return (
                    <NavItem
                      key={t.id}
                      href={href}
                      icon={<Hash size={14} />}
                      label={t.name}
                      count={counts.byTag.get(t.name.toLowerCase()) ?? 0}
                      active={safeDecode(pathname) === `/t/${t.name}`}
                    />
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      <ul className="space-y-0.5 border-t border-line p-3">
        <NavItem href="/trash" icon={<Trash2 size={16} />} label="回收站" active={pathname === "/trash"} />
        <NavItem href="/settings" icon={<Settings size={16} />} label="导入导出与设置" active={pathname === "/settings"} />
        <li>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
          >
            <LogOut size={16} />
            退出登录
          </button>
        </li>
      </ul>
    </nav>
  );
}

function SectionTitle({
  children,
  action,
  onClick,
  open,
}: {
  children: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  open?: boolean;
}) {
  return (
    <div className="mt-5 mb-1 flex h-7 items-center justify-between px-1.5">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-expanded={open}
          className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted hover:text-fg"
        >
          {children}
          <ChevronRight size={12} className={cx("transition-transform", open && "rotate-90")} />
        </button>
      ) : (
        <span className="text-xs font-semibold tracking-wide text-muted">{children}</span>
      )}
      {action}
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  count,
  active,
  warn,
  dropActive,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  warn?: boolean;
  dropActive?: boolean;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
}) {
  return (
    <li>
      <NextLink
        href={href}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cx(
          "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px]",
          active ? "bg-accent-soft font-medium text-accent" : "hover:bg-surface-2",
          dropActive && "bg-accent-soft ring-1 ring-accent",
        )}
      >
        <span className={cx("shrink-0", !active && "text-muted", warn && "text-warn")}>{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {!!count && (
          <span className={cx("text-xs tabular-nums", warn ? "font-medium text-warn" : "text-muted")}>{count}</span>
        )}
      </NextLink>
    </li>
  );
}
