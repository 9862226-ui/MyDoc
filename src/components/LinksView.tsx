"use client";

import {
  Archive,
  ArchiveRestore,
  Clock,
  Copy,
  Folder,
  Hash,
  Inbox,
  Layers,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Share2,
  Star,
  StarOff,
  Tag as TagIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type DragEvent,
  type ReactNode,
  type Ref,
} from "react";
import { api, copyText, readLocal, refreshData, shareText, useAppData, writeLocal } from "@/lib/client";
import { shortTime } from "@/lib/format";
import { detectPlatform, docKind, type DocKind } from "@/lib/platforms";
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
import { LinkCard, LinkRow, LinkTableHeader } from "./LinkItem";
import { LINKS_MIME } from "./Sidebar";
import {
  AlarmIcon,
  Banner,
  Button,
  cx,
  EmptyState,
  FilterMenu,
  IconButton,
  Menu,
  ProjectBadge,
  ProjectDot,
  SearchField,
  Segmented,
  Skeleton,
  useModKey,
  type MenuItem,
} from "./ui";
import { useLinkActions, useUI } from "./ui-context";

type Layout = "table" | "cards";

/** 手机端按类型筛选的分类 */
const KIND_GROUPS: { key: string; label: string; kinds: DocKind[] }[] = [
  { key: "doc", label: "文档", kinds: ["doc", "wiki"] },
  { key: "sheet", label: "表格", kinds: ["sheet", "base", "form"] },
  { key: "slides", label: "幻灯片", kinds: ["slides"] },
  { key: "disk", label: "网盘", kinds: ["disk", "folder", "file", "media"] },
  { key: "design", label: "设计稿", kinds: ["design", "mind", "flow"] },
  { key: "other", label: "其他", kinds: ["code", "web"] },
];

const kindGroupOf = (url: string) => KIND_GROUPS.find((g) => g.kinds.includes(docKind(url)))!.key;

interface Header {
  tile: ReactNode;
  title: string;
  /** 手机端标题上方的小字（项目所在分组） */
  overline?: string;
  meta: string;
  /** 可以在这里添加链接 / 批量导入 */
  canAdd: boolean;
  empty: { title: string; text: ReactNode; illustration: "links" | "done" | "search" };
}

function ViewTile({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-white md:size-12"
      style={{ background: color }}
    >
      {children}
    </span>
  );
}

function headerFor(view: ViewSpec, data: AppData, base: Link[]): Header | null {
  const n = base.length;
  switch (view.kind) {
    case "inbox":
      return {
        tile: (
          <ViewTile color="#646A73">
            <Inbox size={22} />
          </ViewTile>
        ),
        title: "收件箱",
        meta: `添加时没选项目的链接都在这里，可以拖到左侧的项目上归类 · ${n} 个`,
        canAdd: true,
        empty: { title: "收件箱是空的", text: "所有链接都已经归类好了", illustration: "done" },
      };
    case "recent":
      return {
        tile: (
          <ViewTile color="#7B61FF">
            <Clock size={22} />
          </ViewTile>
        ),
        title: "最近访问",
        meta: `最近打开过的 ${RECENT_LIMIT} 个链接`,
        canAdd: false,
        empty: { title: "还没有访问记录", text: "在这里打开过的链接会出现在这里", illustration: "links" },
      };
    case "favorites":
      return {
        tile: (
          <ViewTile color="#FFB400">
            <Star size={22} fill="#FFFFFF" />
          </ViewTile>
        ),
        title: "我的收藏",
        meta: `${n} 个链接，也会显示在工作台的「快速访问」里`,
        canAdd: false,
        empty: {
          title: "还没有收藏",
          text: "在链接的「更多」菜单里点「收藏」，常用的文档会出现在这里和工作台",
          illustration: "links",
        },
      };
    case "expiring":
      return {
        tile: (
          <ViewTile color="#FF8800">
            <AlarmIcon size={22} className="stroke-white" />
          </ViewTile>
        ),
        title: "即将过期",
        meta: `${EXPIRING_DAYS} 天内到期或已经过期的分享链接 · ${n} 个`,
        canAdd: false,
        empty: {
          title: "没有快过期的链接",
          text: `给网盘分享链接设置有效期后，到期前 ${EXPIRING_DAYS} 天会出现在这里`,
          illustration: "done",
        },
      };
    case "all": {
      const projects = new Set(base.map((l) => l.projectId)).size;
      return {
        tile: (
          <ViewTile color="#3370FF">
            <Layers size={22} />
          </ViewTile>
        ),
        title: "全部链接",
        meta: n ? `${n} 个链接，分布在 ${projects} 个项目里` : "还没有链接",
        canAdd: true,
        empty: {
          title: "还没有链接",
          text: "把散落在聊天记录里的共享文档、表格、网盘链接收进来，分项目归类",
          illustration: "links",
        },
      };
    }
    case "tag":
      return {
        tile: (
          <ViewTile color="#13A3A3">
            <Hash size={22} />
          </ViewTile>
        ),
        title: `# ${view.name}`,
        meta: `${n} 个链接带有这个标签`,
        canAdd: true,
        empty: { title: "这个标签下没有链接", text: "给链接加上这个标签后会出现在这里", illustration: "links" },
      };
    case "search":
      return {
        tile: (
          <ViewTile color="#3370FF">
            <Search size={22} />
          </ViewTile>
        ),
        title: `搜索「${view.q}」`,
        meta: n ? `${n} 个结果，按相关程度排序` : "没有找到",
        canAdd: false,
        empty: { title: "没有找到相关的链接", text: "换个关键词试试，也可以输入拼音或首字母", illustration: "search" },
      };
    case "project": {
      const info = projectIndex(data).get(view.id);
      if (!info) return null;
      const latest = base.reduce<string | null>((max, l) => (!max || l.updatedAt > max ? l.updatedAt : max), null);
      const parts = [info.project.description, n ? `${n} 个链接` : "还没有链接", latest && `${shortTime(latest)} 更新`];
      return {
        tile: <ProjectBadge project={info.project} size={48} className="max-md:size-11! max-md:text-xl!" />,
        title: info.project.name,
        overline: info.group?.name,
        meta: parts.filter(Boolean).join(" · "),
        canAdd: true,
        empty: {
          title: "这个项目还没有链接",
          text: `把和「${info.project.name}」有关的文档、表格、网盘分享链接收进来，下次不用再翻聊天记录`,
          illustration: "links",
        },
      };
    }
  }
}

export function LinksView({ view }: { view: ViewSpec }) {
  const { data, error } = useAppData();
  const ui = useUI();
  const actions = useLinkActions();
  const router = useRouter();
  const mod = useModKey();

  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("");
  const [tag, setTag] = useState("");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [layout, setLayout] = useState<Layout>("table");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastClicked = useRef<number | null>(null);

  useEffect(() => {
    setSort(readLocal("mydoc.sort", "updated"));
    setLayout(readLocal("mydoc.view", "table"));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open], [role=menu]")) setSelected(new Set());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const base = useMemo(() => (data ? linksForView(data, view) : []), [data, view]);
  const shown = useMemo(() => {
    if (!data) return [];
    let filtered = applyFilters(base, data, { q, platform, tag });
    if (kind) filtered = filtered.filter((l) => kindGroupOf(l.url) === kind);
    return hasFixedOrder(view) ? filtered : sortLinks(filtered, sort);
  }, [base, data, q, platform, tag, kind, sort, view]);

  // 数据变化后，去掉已经不存在的选中项
  useEffect(() => {
    if (!data || selected.size === 0) return;
    const ids = new Set(data.links.map((l) => l.id));
    if ([...selected].some((id) => !ids.has(id))) setSelected(new Set([...selected].filter((id) => ids.has(id))));
  }, [data, selected]);

  const index = useMemo(() => (data ? projectIndex(data) : null), [data]);

  if (error && !data) {
    return (
      <Page>
        <Banner tone="danger">加载失败：{error.message}</Banner>
      </Page>
    );
  }
  if (!data || !index) return <LinksSkeleton />;

  const header = headerFor(view, data, base);
  if (!header) {
    return (
      <Page>
        <EmptyState
          illustration="search"
          title="项目不存在"
          actions={
            <Button size="lg" onClick={() => router.push("/")}>
              回到工作台
            </Button>
          }
        >
          可能已经被删除了
        </EmptyState>
      </Page>
    );
  }

  const project = view.kind === "project" ? index.get(view.id)!.project : null;
  const showProject = view.kind !== "project" && view.kind !== "inbox";
  const platforms = [...new Map(base.map((l) => [detectPlatform(l.url).key, detectPlatform(l.url)])).values()];
  const tagsInView = [...new Set(base.flatMap((l) => l.tags))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const kindsInView = KIND_GROUPS.filter((g) => base.some((l) => kindGroupOf(l.url) === g.key));
  const filtering = !!(q || platform || tag || kind);
  const addInit = view.kind === "tag" ? { tags: [view.name] } : undefined;

  const toggle = (link: Link, shift: boolean) => {
    const next = new Set(selected);
    if (shift && lastClicked.current !== null) {
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
    project: showProject
      ? { id: link.projectId, label: projectPathLabel(link.projectId === null ? undefined : index.get(link.projectId)) }
      : undefined,
    selected: selected.has(link.id),
    selecting: selected.size > 0,
    onSelect: (shift: boolean) => toggle(link, shift),
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

  const clearFilters = () => {
    setQ("");
    setPlatform("");
    setTag("");
    setKind("");
  };

  const projectMenu: MenuItem[] = project
    ? [
        { label: "编辑项目", icon: <Pencil size={15} />, onSelect: () => ui.editProject(project) },
        { label: "分享项目", icon: <Share2 size={15} />, onSelect: () => ui.shareProject(project) },
        { label: "添加链接", icon: <Plus size={15} />, onSelect: () => ui.addLink() },
        { label: "批量导入", icon: <Upload size={15} />, onSelect: () => ui.importLinks() },
        { divider: true },
        project.archived
          ? { label: "取消归档", icon: <ArchiveRestore size={15} />, onSelect: () => void setArchived(false) }
          : { label: "归档项目", icon: <Archive size={15} />, onSelect: () => void setArchived(true) },
        { label: "删除项目", icon: <Trash2 size={15} />, danger: true, onSelect: () => void deleteProject() },
      ]
    : [];

  return (
    <Page>
      {/* 页头 */}
      <div className="flex items-start gap-x-4 gap-y-3 md:flex-wrap">
        {header.tile}
        <div className="min-w-0 flex-1 md:flex-[1_1_260px]">
          {/* 手机端标题已经在顶栏 */}
          <h1 className="hidden truncate text-xl leading-7 font-semibold md:block">{header.title}</h1>
          {header.overline && <p className="text-[13px] text-faint md:hidden">{header.overline}</p>}
          <p className="mt-0.5 text-[13px] text-muted">{header.meta}</p>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          {project && (
            <Button onClick={() => ui.shareProject(project)}>
              <Share2 size={15} />
              分享
            </Button>
          )}
          {header.canAdd && (
            <Button onClick={() => ui.importLinks()}>
              <Upload size={15} />
              批量导入
            </Button>
          )}
          {project && <Menu label="项目操作" items={projectMenu} trigger={(props) => <OutlineMore {...props} />} />}
        </div>
        {project && (
          <span className="shrink-0 md:hidden">
            <Menu label="项目操作" items={projectMenu} trigger={(props) => <OutlineMore {...props} />} />
          </span>
        )}
      </div>

      {project?.archived && (
        <Banner
          tone="info"
          icon={<Archive size={16} className="shrink-0 text-accent-text" />}
          action={
            <button type="button" className="cursor-pointer" onClick={() => void setArchived(false)}>
              取消归档
            </button>
          }
        >
          这个项目已归档，默认不在侧边栏显示
        </Banner>
      )}

      {base.length === 0 ? (
        <EmptyState
          illustration={header.empty.illustration}
          title={header.empty.title}
          actions={
            header.canAdd && (
              <>
                <Button variant="primary" size="lg" onClick={() => ui.addLink(addInit)}>
                  <Plus size={16} />
                  添加链接
                </Button>
                <Button size="lg" onClick={() => ui.importLinks()}>
                  <Upload size={15} />
                  批量导入
                </Button>
              </>
            )
          }
          tip={
            header.canAdd &&
            `小技巧：在任意页面按 ${mod} + V 粘贴链接，会直接打开添加窗口${view.kind === "project" ? "，并默认放进当前项目" : ""}`
          }
        >
          {header.empty.text}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 筛选：桌面端 */}
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {platforms.length > 1 && (
              <FilterMenu
                label="来源"
                value={platform}
                onChange={setPlatform}
                options={[{ value: "", label: "全部" }, ...platforms.map((p) => ({ value: p.key, label: p.name }))]}
              />
            )}
            {view.kind !== "tag" && tagsInView.length > 0 && (
              <FilterMenu
                label="标签"
                value={tag}
                onChange={setTag}
                options={[{ value: "", label: "全部" }, ...tagsInView.map((t) => ({ value: t, label: t }))]}
              />
            )}
            {!hasFixedOrder(view) && (
              <FilterMenu
                label="排序"
                value={sort}
                onChange={(v) => {
                  setSort(v);
                  writeLocal("mydoc.sort", v);
                }}
                options={Object.entries(SORT_LABELS).map(([k, label]) => ({ value: k as SortKey, label }))}
              />
            )}
            <div className="flex-1" />
            <SearchField
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={view.kind === "project" ? "在项目中筛选" : "在列表中筛选"}
              aria-label="筛选链接"
              className="w-[220px]"
            />
            <Segmented
              label="视图"
              value={layout}
              onChange={(v) => {
                setLayout(v);
                writeLocal("mydoc.view", v);
              }}
              options={[
                { value: "table", label: "列表视图", icon: <List size={16} /> },
                { value: "cards", label: "卡片视图", icon: <LayoutGrid size={16} /> },
              ]}
            />
          </div>

          {/* 筛选：手机端按类型 */}
          {kindsInView.length > 1 && (
            <div role="group" aria-label="按类型筛选" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:hidden">
              {[{ key: "", label: "全部" }, ...kindsInView].map((g) => (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={kind === g.key}
                  onClick={() => setKind(g.key)}
                  className={cx(
                    "h-8 shrink-0 cursor-pointer rounded-full px-3.5",
                    kind === g.key ? "bg-accent text-white" : "bg-field text-fg",
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <EmptyState
              illustration="search"
              title={kind ? "这里没有这类链接" : "没有符合条件的链接"}
              actions={<Button onClick={clearFilters}>清除筛选</Button>}
            >
              换个关键词或筛选条件试试
            </EmptyState>
          ) : layout === "cards" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {shown.map((l) => (
                <LinkCard key={l.id} {...itemProps(l)} />
              ))}
            </div>
          ) : (
            <div className="md:overflow-x-auto">
              <div className={showProject ? "md:min-w-[860px]" : "md:min-w-[760px]"}>
                <LinkTableHeader
                  showProject={showProject}
                  checked={selected.size > 0 && shown.every((l) => selected.has(l.id))}
                  indeterminate={selected.size > 0 && !shown.every((l) => selected.has(l.id))}
                  onToggleAll={() =>
                    setSelected(shown.every((l) => selected.has(l.id)) ? new Set() : new Set(shown.map((l) => l.id)))
                  }
                />
                {shown.map((l) => (
                  <LinkRow key={l.id} {...itemProps(l)} />
                ))}
              </div>
            </div>
          )}

          {shown.length > 0 && (
            <p className="text-[13px] text-faint md:px-3">
              {filtering ? `筛选出 ${shown.length} 个，共 ${base.length} 个链接` : `共 ${base.length} 个链接`}
              {filtering && (
                <button
                  type="button"
                  className="ml-2 cursor-pointer text-accent-text hover:underline"
                  onClick={clearFilters}
                >
                  清除筛选
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <BatchBar
          data={data}
          links={shown.filter((l) => selected.has(l.id))}
          total={shown.length}
          onSelectAll={() => setSelected(new Set(shown.map((l) => l.id)))}
          onClear={() => setSelected(new Set())}
          onMove={(projectId, label) =>
            void actions.move([...selected], projectId, label).then(() => setSelected(new Set()))
          }
        />
      )}
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pt-4 pb-12 md:px-8 md:pt-6">
      {children}
    </div>
  );
}

function OutlineMore(props: Parameters<NonNullable<Parameters<typeof Menu>[0]["trigger"]>>[0]) {
  return (
    <IconButton label="项目操作" variant="outline" {...props}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </svg>
    </IconButton>
  );
}

/** 选中链接后出现的底部浮动操作条 */
function BatchBar({
  data,
  links,
  total,
  onSelectAll,
  onClear,
  onMove,
}: {
  data: AppData;
  links: Link[];
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  onMove: (projectId: number | null, label: string) => void;
}) {
  const ui = useUI();
  const actions = useLinkActions();
  const ids = links.map((l) => l.id);
  const allFavorite = links.length > 0 && links.every((l) => l.favorite);

  const moveItems: MenuItem[] = [
    { label: "收件箱", icon: <ProjectDot id={null} />, onSelect: () => onMove(null, "收件箱") },
    ...data.groups.flatMap((g): MenuItem[] => {
      const projects = data.projects.filter((p) => p.groupId === g.id && !p.archived);
      if (!projects.length) return [];
      return [
        { heading: g.name },
        ...projects.map((p) => ({
          label: p.name,
          icon: <ProjectBadge project={p} size={16} />,
          onSelect: () => onMove(p.id, `${g.name} / ${p.name}`),
        })),
      ];
    }),
  ];

  const copyAll = async () => {
    const ok = await copyText(links.map((l) => shareText(l, true)).join("\n\n"));
    ui.toast(ok ? `已复制 ${links.length} 个链接` : "复制失败", { kind: ok ? "ok" : "error" });
  };

  return (
    <div
      role="toolbar"
      aria-label="批量操作"
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 rounded-[10px] border border-line-strong bg-menu py-1.5 pr-1.5 pl-4 shadow-[0_8px_24px_var(--shadow)] md:bottom-10 md:left-[calc(50%+120px)] md:max-w-[calc(100vw-272px)]"
    >
      <span className="mr-1 font-medium whitespace-nowrap">已选 {links.length} 项</span>
      {links.length < total && (
        <button
          type="button"
          onClick={onSelectAll}
          className="mr-1 cursor-pointer text-[13px] whitespace-nowrap text-accent-text hover:underline max-sm:hidden"
        >
          全选 {total} 项
        </button>
      )}
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <Menu
        label="移动到"
        align="start"
        items={moveItems}
        menuClassName="min-w-52"
        trigger={(props) => <BarButton icon={<Folder size={16} />} label="移动到" {...props} />}
      />
      <BarButton icon={<TagIcon size={16} />} label="添加标签" onClick={() => ui.addTagsTo(ids, onClear)} />
      <BarButton
        icon={allFavorite ? <StarOff size={16} /> : <Star size={16} />}
        label={allFavorite ? "取消收藏" : "收藏"}
        onClick={() => void actions.batch(ids, { action: "favorite", value: !allFavorite }).then(onClear)}
      />
      <BarButton icon={<Copy size={16} />} label="复制链接" onClick={() => void copyAll()} />
      <BarButton
        icon={<Trash2 size={16} />}
        label="删除"
        danger
        onClick={() => void actions.remove(ids).then(onClear)}
      />
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <IconButton label="取消选择" className="size-[34px]" onClick={onClear}>
        <X size={16} />
      </IconButton>
    </div>
  );
}

function BarButton({
  icon,
  label,
  danger,
  ...props
}: { icon: ReactNode; label: string; danger?: boolean } & ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: Ref<HTMLButtonElement>;
  }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 whitespace-nowrap transition-colors",
        danger ? "text-danger-text hover:bg-danger-soft" : "text-fg hover:bg-hover",
      )}
      {...props}
    >
      <span className={danger ? "text-danger-text" : "text-muted"}>{icon}</span>
      <span className="max-sm:hidden">{label}</span>
    </button>
  );
}

/** 列表加载中的骨架屏 */
export function LinksSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pt-4 md:px-8 md:pt-6">
      <p role="status" className="sr-only">
        正在加载
      </p>
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-[10px]" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="w-64 max-w-full" />
        </div>
      </div>
      <div className="hidden gap-2 md:flex">
        {[88, 88, 112].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
        ))}
      </div>
      <div className="flex flex-col">
        {["42%", "56%", "38%", "50%", "44%", "34%", "48%"].map((w, i) => (
          <div key={i} className="flex h-14 items-center gap-3 border-b border-line-soft md:px-3">
            <Skeleton className="size-[30px] shrink-0 rounded-[7px]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton style={{ width: w }} />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <Skeleton className="hidden w-16 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
