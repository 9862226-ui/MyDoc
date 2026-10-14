"use client";

import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { api, readLocal, refreshData, useAppData, writeLocal } from "@/lib/client";
import type { Group, Project } from "@/lib/types";
import { safeDecode } from "@/lib/url";
import { isReminderDue } from "@/lib/reminders";
import { isExpiring } from "@/lib/view";
import { NavIcon } from "./nav-icons";
import { cx, IconButton, Logo, Menu, ProjectBadge, Skeleton, type MenuItem } from "./ui";
import { useLinkActions, useUI } from "./ui-context";

export const LINKS_MIME = "application/x-mydoc-links";
const PROJECT_MIME = "application/x-mydoc-project";
const GROUP_MIME = "application/x-mydoc-group";

const hasType = (e: DragEvent, type: string) => e.dataTransfer.types.includes(type);

/** 拖动时的放置提示：放进去 / 插到前面 */
type DropHint = { key: string; mode: "into" | "before" } | null;

/** 「新建」菜单的内容，侧边栏和手机端共用 */
export function useCreateMenu(): MenuItem[] {
  const ui = useUI();
  const { data } = useAppData();
  return [
    { label: "添加链接", icon: <NavIcon name="link" />, shortcut: "N", onSelect: () => ui.addLink() },
    { label: "批量导入", icon: <NavIcon name="import" />, onSelect: () => ui.importLinks() },
    { label: "添加摘录", icon: <NavIcon name="quote" />, onSelect: () => ui.editSnippet() },
    { label: "添加提醒", icon: <NavIcon name="bell" />, onSelect: () => ui.editReminder() },
    { divider: true },
    {
      label: "新建项目",
      icon: <NavIcon name="folderPlus" />,
      // 还没有分组时先建分组
      onSelect: () => (data?.groups.length ? ui.editProject() : ui.editGroup()),
    },
    { label: "新建分组", icon: <NavIcon name="group" />, onSelect: () => ui.editGroup() },
  ];
}

/**
 * 导航树：桌面端显示在左侧边栏；手机端作为「项目」页（variant="page"），
 * 不显示标志、新建按钮，以及底部标签栏里已有的入口。
 */
export function Sidebar({ variant = "sidebar" }: { variant?: "sidebar" | "page" }) {
  const { data } = useAppData();
  const pathname = usePathname();
  const router = useRouter();
  const ui = useUI();
  const actions = useLinkActions();
  const createMenu = useCreateMenu();
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [drop, setDrop] = useState<DropHint>(null);
  const page = variant === "page";

  useEffect(() => {
    setCollapsed(readLocal("mydoc.collapsed", {}));
    setShowArchived(readLocal("mydoc.showArchived", false));
    setTagsOpen(readLocal("mydoc.tagsOpen", true));
  }, []);

  const counts = useMemo(() => {
    const byProject = new Map<number, number>();
    let inbox = 0;
    let favorites = 0;
    let expiring = 0;
    for (const l of data?.links ?? []) {
      if (l.projectId === null) inbox++;
      else byProject.set(l.projectId, (byProject.get(l.projectId) ?? 0) + 1);
      if (l.favorite) favorites++;
      if (isExpiring(l)) expiring++;
    }
    const reminders = (data?.reminders ?? []).filter((r) => isReminderDue(r)).length;
    return { byProject, inbox, favorites, expiring, reminders, all: data?.links.length ?? 0 };
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
      message: n ? `其中的 ${n} 个项目也会被删除，项目里的链接会移到收件箱，不会丢失。` : "这个分组是空的。",
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
      ui.toast(archived ? `已归档「${p.name}」，勾选「显示已归档的项目」可以看到` : `已恢复「${p.name}」`);
    });

  const archivedCount = data?.projects.filter((p) => p.archived).length ?? 0;

  return (
    <nav aria-label="主导航" className={cx("flex flex-col", page ? "px-2 pt-2 pb-4" : "h-full bg-side")}>
      {!page && (
        <div className="px-3 pt-4">
          <div className="flex items-center gap-2.5 px-2 pt-1 pb-3.5">
            <Logo />
            <span className="text-base font-semibold">MyDoc</span>
          </div>
          <div className="mx-1 mb-3.5">
            <Menu
              label="新建"
              align="start"
              matchWidth
              items={createMenu}
              trigger={(props) => (
                <button
                  type="button"
                  {...props}
                  className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-accent font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  <Plus size={16} strokeWidth={2.2} />
                  新建
                  <ChevronDown size={14} strokeWidth={2.2} />
                </button>
              )}
            />
          </div>
        </div>
      )}

      <div className={cx("flex flex-col gap-0.5", !page && "min-h-0 flex-1 overflow-y-auto px-3 pb-3")}>
        {page ? (
          <ul aria-label="常用入口" className="grid grid-cols-3 gap-2 px-1 pt-1">
            <QuickTile href="/inbox" icon="inbox" label="收件箱" count={counts.inbox} />
            <QuickTile
              href={counts.reminders === 0 && counts.expiring > 0 ? "/expiring" : "/reminders"}
              icon="alarm"
              label="到期提醒"
              count={counts.reminders + counts.expiring}
              warn
            />
            <QuickTile href="/snippets" icon="quote" label="摘录" count={data?.snippets.length ?? 0} />
            <QuickTile href="/all" icon="layers" label="全部链接" count={counts.all} />
            <QuickTile href="/recent" icon="clock" label="最近访问" />
            <QuickTile href="/trash" icon="trash" label="回收站" />
          </ul>
        ) : (
          <>
            <ul className="flex flex-col gap-0.5">
              <NavItem href="/" icon="home" label="工作台" active={pathname === "/"} />
            </ul>
            {/* 工作记录和收藏是两个独立的模块，分开显示 */}
            <SectionTitle>工作</SectionTitle>
            <ul className="flex flex-col gap-0.5">
              <NavItem href="/work" icon="work" label="工作记录" active={pathname === "/work"} />
              <NavItem href="/meetings" icon="meeting" label="会议纪要" active={pathname === "/meetings"} />
            </ul>
            <SectionTitle>收藏</SectionTitle>
            <ul className="flex flex-col gap-0.5">
              <NavItem
                href="/inbox"
                icon="inbox"
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
              <NavItem
                href="/favorites"
                icon="star"
                label="我的收藏"
                count={counts.favorites}
                active={pathname === "/favorites"}
              />
              <NavItem
                href={counts.reminders === 0 && counts.expiring > 0 ? "/expiring" : "/reminders"}
                icon="alarm"
                label="到期提醒"
                count={counts.reminders + counts.expiring}
                warn
                active={pathname === "/reminders" || pathname === "/expiring"}
              />
              <NavItem
                href="/snippets"
                icon="quote"
                label="摘录"
                count={data?.snippets.length ?? 0}
                active={pathname === "/snippets"}
              />
              <NavItem href="/all" icon="layers" label="全部链接" count={counts.all} active={pathname === "/all"} />
            </ul>
          </>
        )}

        <SectionTitle
          action={
            <Menu
              label="新建项目或分组"
              items={[
                {
                  label: "新建项目",
                  icon: <NavIcon name="folderPlus" />,
                  onSelect: () => (data?.groups.length ? ui.editProject() : ui.editGroup()),
                },
                { label: "新建分组", icon: <NavIcon name="group" />, onSelect: () => ui.editGroup() },
              ]}
              trigger={(props) => (
                <IconButton
                  label="新建项目或分组"
                  size="sm"
                  className={page ? "size-9" : "size-[22px] rounded"}
                  {...props}
                >
                  <Plus size={page ? 18 : 14} />
                </IconButton>
              )}
            />
          }
        >
          项目
        </SectionTitle>

        {!data ? (
          <div className="flex flex-col gap-3 px-2.5 py-2">
            {[72, 64, 88].map((w) => (
              <div key={w} className="flex items-center gap-2 pl-4">
                <Skeleton className="size-[18px] rounded" />
                <Skeleton style={{ width: w }} />
              </div>
            ))}
          </div>
        ) : data.groups.length === 0 ? (
          <button
            type="button"
            onClick={() => ui.editGroup()}
            className="mx-1 rounded-md border border-dashed border-line-strong px-3 py-3 text-left text-[13px] text-muted hover:border-accent/60 hover:text-fg"
          >
            还没有分组，点这里新建一个（例如「工作」「个人」）
          </button>
        ) : (
          <div className="flex flex-col gap-0.5">
            {data.groups.map((g) => {
              const projects = projectsOf(g.id).filter((p) => showArchived || !p.archived);
              const open = !collapsed[g.id];
              const key = `g${g.id}`;
              return (
                <div key={g.id}>
                  <div
                    draggable={!page}
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
                      "group/row flex items-center rounded-md",
                      page ? "h-10" : "h-[30px]",
                      drop?.key === key && drop.mode === "before" && "shadow-[inset_0_2px_0_var(--accent)]",
                      drop?.key === key && drop.mode === "into" && "bg-accent-soft",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      aria-expanded={open}
                      className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1 px-2 text-left text-[13px] text-muted hover:text-fg"
                    >
                      <ChevronRight
                        size={14}
                        className={cx("shrink-0 text-icon transition-transform", open && "rotate-90")}
                      />
                      <span className="truncate">{g.name}</span>
                    </button>
                    <span
                      className={cx(
                        "flex pr-0.5 focus-within:opacity-100 pointer-coarse:opacity-100",
                        !page && "opacity-0 group-hover/row:opacity-100",
                      )}
                    >
                      <IconButton
                        label="新建项目"
                        size="sm"
                        className="size-[26px]"
                        onClick={() => ui.editProject(undefined, g.id)}
                      >
                        <Plus size={14} />
                      </IconButton>
                      <Menu
                        className="size-[26px]"
                        label="分组操作"
                        items={[
                          {
                            label: "新建项目",
                            icon: <Plus size={15} />,
                            onSelect: () => ui.editProject(undefined, g.id),
                          },
                          { label: "重命名", icon: <Pencil size={15} />, onSelect: () => ui.editGroup(g) },
                          { divider: true },
                          {
                            label: "删除分组",
                            icon: <Trash2 size={15} />,
                            danger: true,
                            onSelect: () => void deleteGroup(g),
                          },
                        ]}
                      />
                    </span>
                  </div>

                  {open && (
                    <ul className="flex flex-col gap-0.5">
                      {projects.map((p) => {
                        const pkey = `p${p.id}`;
                        const active = pathname === `/p/${p.id}`;
                        const count = counts.byProject.get(p.id) ?? 0;
                        return (
                          <li key={p.id} className="group/proj relative">
                            <NextLink
                              href={`/p/${p.id}`}
                              draggable={!page}
                              aria-current={active ? "page" : undefined}
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
                                "flex items-center gap-2 rounded-md pr-2.5 pl-[26px]",
                                !page && "pointer-coarse:pr-10",
                                page ? "h-11" : "h-[34px]",
                                active ? "bg-accent-soft font-medium text-accent-text" : "hover:bg-nav-hover",
                                p.archived && "text-faint",
                                drop?.key === pkey && drop.mode === "into" && "bg-accent-soft ring-1 ring-accent",
                                drop?.key === pkey && drop.mode === "before" && "shadow-[inset_0_2px_0_var(--accent)]",
                              )}
                            >
                              {p.archived ? (
                                <span className="flex size-[18px] shrink-0 items-center justify-center rounded bg-chip text-faint">
                                  <Archive size={12} />
                                </span>
                              ) : (
                                <ProjectBadge project={p} size={18} />
                              )}
                              <span className="min-w-0 flex-1 truncate">{p.name}</span>
                              <span
                                className={cx(
                                  "text-xs font-normal text-faint tabular-nums",
                                  !page && "group-hover/proj:invisible pointer-coarse:invisible",
                                )}
                              >
                                {count || ""}
                              </span>
                            </NextLink>
                            {/* 手机端「项目」页不放更多按钮，进入项目后在页头操作 */}
                            {!page && (
                              <span className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/proj:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                                <Menu
                                  className="size-[26px]"
                                  label="项目操作"
                                  items={[
                                    {
                                      label: "编辑项目",
                                      icon: <Pencil size={15} />,
                                      onSelect: () => ui.editProject(p),
                                    },
                                    p.archived
                                      ? {
                                          label: "取消归档",
                                          icon: <ArchiveRestore size={15} />,
                                          onSelect: () => void setArchived(p, false),
                                        }
                                      : {
                                          label: "归档",
                                          icon: <Archive size={15} />,
                                          onSelect: () => void setArchived(p, true),
                                        },
                                    { divider: true },
                                    {
                                      label: "删除项目",
                                      icon: <Trash2 size={15} />,
                                      danger: true,
                                      onSelect: () => void deleteProject(p),
                                    },
                                  ]}
                                />
                              </span>
                            )}
                          </li>
                        );
                      })}
                      {projects.length === 0 && (
                        <li>
                          <button
                            type="button"
                            onClick={() => ui.editProject(undefined, g.id)}
                            className={cx(
                              "flex w-full cursor-pointer items-center gap-2 rounded-md pl-[26px] text-[13px] text-faint hover:bg-nav-hover hover:text-fg",
                              page ? "h-11" : "h-[34px]",
                            )}
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
              <label className="flex cursor-pointer items-center gap-2 px-2.5 pt-1.5 text-xs text-faint">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => {
                    setShowArchived(e.target.checked);
                    writeLocal("mydoc.showArchived", e.target.checked);
                  }}
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
              <div className="flex flex-wrap gap-1.5 px-2.5">
                {data.tags.map((t) => {
                  const active = safeDecode(pathname) === `/t/${t.name}`;
                  return (
                    <NextLink
                      key={t.id}
                      href={`/t/${encodeURIComponent(t.name)}`}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "max-w-full truncate rounded px-2 text-xs",
                        page ? "leading-8" : "leading-[22px]",
                        active ? "bg-accent-soft text-accent-text" : "bg-chip text-muted hover:text-fg",
                      )}
                    >
                      # {t.name}
                    </NextLink>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {!page && (
        <ul className="px-3 pt-2 pb-4">
          <NavItem href="/trash" icon="trash" label="回收站" active={pathname === "/trash"} muted />
        </ul>
      )}
    </nav>
  );
}

/** 手机「项目」页顶部的快捷入口 */
function QuickTile({
  href,
  icon,
  label,
  count,
  warn,
}: {
  href: string;
  icon: Parameters<typeof NavIcon>[0]["name"];
  label: string;
  count?: number;
  warn?: boolean;
}) {
  const alert = warn && !!count;
  return (
    <li>
      <NextLink
        href={href}
        className={cx(
          "flex h-[76px] flex-col justify-between rounded-lg border p-3 active:bg-hover",
          alert ? "border-warn/40 bg-warn-soft" : "border-line bg-surface",
        )}
      >
        <div className="flex items-center justify-between">
          <span className={alert ? "text-warn" : "text-muted"}>
            <NavIcon name={icon} />
          </span>
          {!!count && (
            <span className={cx("text-[13px] tabular-nums", alert ? "font-semibold text-warn-text" : "text-faint")}>
              {count}
            </span>
          )}
        </div>
        <span className="truncate text-[13px] font-medium">{label}</span>
      </NextLink>
    </li>
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
    <div className="flex items-center justify-between px-2.5 pt-[18px] pb-1.5 text-xs text-faint">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-expanded={open}
          className="flex cursor-pointer items-center gap-1 hover:text-fg"
        >
          {children}
          <ChevronRight size={12} className={cx("transition-transform", open && "rotate-90")} />
        </button>
      ) : (
        <span>{children}</span>
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
  muted,
  className,
  dropActive,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  href: string;
  icon: Parameters<typeof NavIcon>[0]["name"];
  label: string;
  count?: number;
  active?: boolean;
  warn?: boolean;
  muted?: boolean;
  className?: string;
  dropActive?: boolean;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
}) {
  return (
    <li>
      <NextLink
        href={href}
        aria-current={active ? "page" : undefined}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cx(
          "flex h-9 items-center gap-2.5 rounded-md px-2.5",
          active
            ? "bg-accent-soft font-medium text-accent-text"
            : muted
              ? "text-muted hover:bg-nav-hover"
              : "hover:bg-nav-hover",
          dropActive && "bg-accent-soft ring-1 ring-accent",
          className,
        )}
      >
        <span className={cx("shrink-0", active ? "text-accent-text" : warn ? "text-warn" : "text-muted")}>
          <NavIcon name={icon} />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {!!count && (
          <span className={cx("text-xs tabular-nums", warn ? "font-medium text-warn-text" : "font-normal text-faint")}>
            {count}
          </span>
        )}
      </NextLink>
    </li>
  );
}
