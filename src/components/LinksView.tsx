"use client";

import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  Clock,
  FolderOpen,
  Hash,
  Inbox,
  LayoutGrid,
  Layers,
  List,
  Pencil,
  Plus,
  Search,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { api, readLocal, refreshData, useAppData, writeLocal } from "@/lib/client";
import { detectPlatform } from "@/lib/platforms";
import type { AppData, Link } from "@/lib/types";
import {
  applyFilters,
  EXPIRING_DAYS,
  hasFixedOrder,
  linksForView,
  projectIndex,
  projectPathLabel,
  RECENT_LIMIT,
  SORT_LABELS,
  sortLinks,
  type SortKey,
  type ViewSpec,
} from "@/lib/view";
import { parseProjectValue, ProjectOptions } from "./fields";
import { LinkCard, LinkRow } from "./LinkItem";
import { LINKS_MIME } from "./Sidebar";
import { Button, cx, EmptyState, IconButton, Input, Menu, Select, Spinner } from "./ui";
import { useLinkActions, useUI } from "./ui-context";

interface Header {
  icon: ReactNode;
  title: string;
  crumb?: string;
  description?: string;
  empty: { title: string; text: string };
}

function headerFor(view: ViewSpec, data: AppData): Header | null {
  switch (view.kind) {
    case "inbox":
      return {
        icon: <Inbox size={20} />,
        title: "收件箱",
        description: "添加时没选项目的链接都在这里，可以拖到左侧项目里归类",
        empty: { title: "收件箱是空的", text: "所有链接都已经归类好了 👍" },
      };
    case "recent":
      return {
        icon: <Clock size={20} />,
        title: "最近访问",
        description: `最近打开过的 ${RECENT_LIMIT} 个链接`,
        empty: { title: "还没有访问记录", text: "在这里打开过的链接会出现在这里" },
      };
    case "favorites":
      return {
        icon: <Star size={20} />,
        title: "收藏",
        empty: { title: "还没有收藏", text: "点链接卡片右上角的星标就能收藏" },
      };
    case "expiring":
      return {
        icon: <AlarmClock size={20} />,
        title: "即将过期",
        description: `${EXPIRING_DAYS} 天内到期或已经过期的分享链接`,
        empty: { title: "没有快过期的链接", text: "给链接设置有效期后，快到期时会出现在这里" },
      };
    case "all":
      return {
        icon: <Layers size={20} />,
        title: "全部链接",
        empty: { title: "还没有链接", text: "添加第一个文档链接吧，也可以在页面任意位置直接 Ctrl+V 粘贴" },
      };
    case "tag":
      return {
        icon: <Hash size={20} />,
        title: view.name,
        crumb: "标签",
        empty: { title: "这个标签下没有链接", text: "" },
      };
    case "project": {
      const info = projectIndex(data).get(view.id);
      if (!info) return null;
      return {
        icon: <FolderOpen size={20} />,
        title: info.project.name,
        crumb: info.group?.name,
        description: info.project.description,
        empty: { title: "这个项目还没有链接", text: "添加链接，或者把其他链接拖到左侧的这个项目上" },
      };
    }
  }
}

export function LinksView({ view }: { view: ViewSpec }) {
  const { data, error } = useAppData();
  const ui = useUI();
  const actions = useLinkActions();
  const router = useRouter();

  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastClicked = useRef<number | null>(null);

  useEffect(() => {
    setSort(readLocal("mydoc.sort", "updated"));
    setLayout(readLocal("mydoc.layout", "grid"));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) setSelected(new Set());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const base = useMemo(() => (data ? linksForView(data, view) : []), [data, view]);
  const shown = useMemo(() => {
    if (!data) return [];
    const filtered = applyFilters(base, data, { q, platform, tag });
    return hasFixedOrder(view) ? filtered : sortLinks(filtered, sort);
  }, [base, data, q, platform, tag, sort, view]);

  // 数据变化后，去掉已经不存在的选中项
  useEffect(() => {
    if (!data || selected.size === 0) return;
    const ids = new Set(data.links.map((l) => l.id));
    if ([...selected].some((id) => !ids.has(id))) setSelected(new Set([...selected].filter((id) => ids.has(id))));
  }, [data, selected]);

  const index = useMemo(() => (data ? projectIndex(data) : null), [data]);

  if (error && !data) return <p className="p-8 text-danger">加载失败：{error.message}</p>;
  if (!data || !index) {
    return (
      <div className="flex justify-center p-16 text-muted">
        <Spinner size={22} />
      </div>
    );
  }

  const header = headerFor(view, data);
  if (!header) {
    return (
      <div className="p-6 md:p-8">
        <EmptyState
          icon={<FolderOpen size={32} />}
          title="项目不存在"
          actions={<Button onClick={() => router.push("/")}>回到首页</Button>}
        >
          可能已经被删除了
        </EmptyState>
      </div>
    );
  }

  const project = view.kind === "project" ? index.get(view.id)!.project : null;
  const platforms = [...new Map(base.map((l) => [detectPlatform(l.url).key, detectPlatform(l.url)])).values()];
  const tagsInView = [...new Set(base.flatMap((l) => l.tags))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const filtering = !!(q || platform || tag);

  const toggle = (link: Link, e: MouseEvent) => {
    const next = new Set(selected);
    if (e.shiftKey && lastClicked.current !== null) {
      const ids = shown.map((l) => l.id);
      const [a, b] = [ids.indexOf(lastClicked.current), ids.indexOf(link.id)].sort((x, y) => x - y);
      if (a >= 0) ids.slice(a, b + 1).forEach((id) => next.add(id));
    } else if (next.has(link.id)) next.delete(link.id);
    else next.add(link.id);
    lastClicked.current = link.id;
    setSelected(next);
  };

  const dragStart = (link: Link) => (e: DragEvent) => {
    const ids = selected.has(link.id) ? [...selected] : [link.id];
    e.dataTransfer.setData(LINKS_MIME, JSON.stringify(ids));
    e.dataTransfer.setData("text/uri-list", link.url);
    e.dataTransfer.setData("text/plain", link.url);
    e.dataTransfer.effectAllowed = "copyMove";
  };

  const itemProps = (link: Link) => ({
    link,
    project:
      view.kind === "project"
        ? undefined
        : {
            id: link.projectId,
            label: projectPathLabel(link.projectId === null ? undefined : index.get(link.projectId)),
          },
    selected: selected.has(link.id),
    selecting: selected.size > 0,
    onSelect: (e: MouseEvent) => toggle(link, e),
    onDragStart: dragStart(link),
  });

  const setArchived = async (archived: boolean) => {
    try {
      await api(`/api/projects/${project!.id}`, { method: "PATCH", body: { archived } });
      await refreshData();
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const deleteProject = async () => {
    const ok = await ui.confirm({
      title: `删除项目「${project!.name}」？`,
      message: base.length ? `其中的 ${base.length} 个链接会移到收件箱，不会丢失。` : "这个项目是空的。",
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/projects/${project!.id}`, { method: "DELETE" });
      router.push("/inbox");
      await refreshData();
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const selectedIds = [...selected];
  const clearSelection = () => setSelected(new Set());

  return (
    <div className="mx-auto max-w-7xl p-4 pb-28 md:p-8">
      {/* 标题 */}
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {header.crumb && <div className="mb-0.5 text-xs text-muted">{header.crumb}</div>}
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <span className="text-muted">{header.icon}</span>
            <span className="truncate">{header.title}</span>
            {project && (
              <span className="flex items-center">
                <IconButton label="编辑项目" onClick={() => ui.editProject(project)}>
                  <Pencil size={15} />
                </IconButton>
                <Menu
                  label="项目操作"
                  items={[
                    project.archived
                      ? { label: "取消归档", icon: <ArchiveRestore size={14} />, onSelect: () => void setArchived(false) }
                      : { label: "归档项目", icon: <Archive size={14} />, onSelect: () => void setArchived(true) },
                    { divider: true },
                    { label: "删除项目", icon: <Trash2 size={14} />, danger: true, onSelect: () => void deleteProject() },
                  ]}
                />
              </span>
            )}
          </h1>
          {header.description && <p className="mt-1 text-[13px] text-muted">{header.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => ui.importLinks()}>
            <Upload size={15} />
            <span className="hidden sm:inline">批量导入</span>
          </Button>
          <Button variant="primary" onClick={() => ui.addLink(view.kind === "tag" ? { tags: [view.name] } : undefined)}>
            <Plus size={16} />
            添加链接
          </Button>
        </div>
      </div>

      {project?.archived && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-surface-2 px-4 py-2.5 text-[13px] text-muted">
          <Archive size={16} />
          <span className="flex-1">这个项目已归档，默认不在侧边栏显示</span>
          <Button size="sm" onClick={() => void setArchived(false)}>
            取消归档
          </Button>
        </div>
      )}

      {base.length === 0 ? (
        <EmptyState
          icon={header.icon}
          title={header.empty.title}
          actions={
            !["recent", "expiring", "favorites"].includes(view.kind) && (
              <>
                <Button variant="primary" onClick={() => ui.addLink(view.kind === "tag" ? { tags: [view.name] } : undefined)}>
                  <Plus size={16} />
                  添加链接
                </Button>
                <Button onClick={() => ui.importLinks()}>
                  <Upload size={15} />
                  批量导入
                </Button>
              </>
            )
          }
        >
          {header.empty.text}
        </EmptyState>
      ) : (
        <>
          {/* 工具栏 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1 sm:max-w-72">
              <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="在当前列表中筛选" className="pl-8" />
            </div>
            {platforms.length > 1 && (
              <Select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-auto" aria-label="按平台筛选">
                <option value="">全部平台</option>
                {platforms.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
            {view.kind !== "tag" && tagsInView.length > 0 && (
              <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-auto" aria-label="按标签筛选">
                <option value="">全部标签</option>
                {tagsInView.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </Select>
            )}
            {!hasFixedOrder(view) && (
              <Select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortKey);
                  writeLocal("mydoc.sort", e.target.value);
                }}
                className="w-auto"
                aria-label="排序"
              >
                {Object.entries(SORT_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
            <div className="ml-auto inline-flex rounded-lg border border-line bg-surface p-0.5">
              {(
                [
                  ["grid", "卡片", <LayoutGrid key="g" size={15} />],
                  ["list", "列表", <List key="l" size={15} />],
                ] as const
              ).map(([key, label, icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={layout === key}
                  onClick={() => {
                    setLayout(key);
                    writeLocal("mydoc.layout", key);
                  }}
                  className={cx(
                    "flex size-7 items-center justify-center rounded-md",
                    layout === key ? "bg-accent-soft text-accent" : "text-muted hover:text-fg",
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {filtering && (
            <p className="mb-3 text-[13px] text-muted">
              筛选出 {shown.length} / {base.length} 个
              <button
                type="button"
                className="ml-2 text-accent hover:underline"
                onClick={() => {
                  setQ("");
                  setPlatform("");
                  setTag("");
                }}
              >
                清除筛选
              </button>
            </p>
          )}

          {shown.length === 0 ? (
            <EmptyState icon={<Search size={28} />} title="没有符合条件的链接" />
          ) : layout === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {shown.map((l) => (
                <LinkCard key={l.id} {...itemProps(l)} />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {shown.map((l) => (
                <LinkRow key={l.id} {...itemProps(l)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* 批量操作 */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-3 md:left-64">
          <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-xl">
            <span className="px-1 text-[13px] font-medium">已选 {selected.size} 个</span>
            {selected.size < shown.length && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(shown.map((l) => l.id)))}>
                全选
              </Button>
            )}
            <Select
              value=""
              aria-label="移动到"
              className="h-8 w-auto text-[13px]"
              onChange={(e) => {
                const projectId = parseProjectValue(e.target.value);
                const label = projectPathLabel(projectId === null ? undefined : index.get(projectId));
                void actions.move(selectedIds, projectId, label).then(clearSelection);
              }}
            >
              <option value="" disabled>
                移动到…
              </option>
              <ProjectOptions data={data} />
            </Select>
            <Button size="sm" onClick={() => ui.addTagsTo(selectedIds, clearSelection)}>
              <Tag size={14} />
              加标签
            </Button>
            <Button size="sm" onClick={() => void actions.batch(selectedIds, { action: "favorite", value: true }).then(clearSelection)}>
              <Star size={14} />
              收藏
            </Button>
            <Button
              size="sm"
              className="text-danger"
              onClick={() => void actions.remove(selectedIds).then(clearSelection)}
            >
              <Trash2 size={14} />
              删除
            </Button>
            <IconButton label="取消选择" onClick={clearSelection}>
              <X size={16} />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
