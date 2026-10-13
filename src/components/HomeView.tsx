"use client";

import { Bell, FolderPlus, Plus, Search, Upload } from "lucide-react";
import NextLink from "next/link";
import { useState, type ReactNode } from "react";
import { useAppData } from "@/lib/client";
import { expiryInfo, shortDate, shortTime } from "@/lib/format";
import { platformLabel } from "@/lib/platforms";
import { isReminderDue, reminderState, sortReminders } from "@/lib/reminders";
import type { Link, Reminder } from "@/lib/types";
import { daysUntil, isExpiring, projectIndex, projectPathLabel } from "@/lib/view";
import { CodeChip, ExpiryChip } from "./LinkItem";
import { Banner, Button, DocIcon, EmptyState, Kbd, ProjectDot, Skeleton, StarIcon, Tabs, useModKey } from "./ui";
import { useLinkActions, useUI } from "./ui-context";

const QUICK_LIMIT = 10;
const LIST_LIMIT = 8;

type Tab = "recent" | "added";

export function HomeView() {
  const { data } = useAppData();
  const ui = useUI();
  const [tab, setTab] = useState<Tab>("recent");

  if (!data) return <HomeSkeleton />;
  if (data.links.length === 0) return <Welcome hasGroups={data.groups.length > 0} />;

  const index = projectIndex(data);
  const label = (l: Link) => projectPathLabel(l.projectId === null ? undefined : index.get(l.projectId));
  const favorites = data.links
    .filter((l) => l.favorite)
    .sort((a, b) => b.visitCount - a.visitCount || (b.lastVisitedAt ?? "").localeCompare(a.lastVisitedAt ?? ""))
    .slice(0, QUICK_LIMIT);
  const lists: Record<Tab, Link[]> = {
    recent: data.links
      .filter((l) => l.lastVisitedAt)
      .sort((a, b) => b.lastVisitedAt!.localeCompare(a.lastVisitedAt!))
      .slice(0, LIST_LIMIT),
    added: [...data.links].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id).slice(0, LIST_LIMIT),
  };
  const inbox = data.links.filter((l) => l.projectId === null).length;
  const expiring = data.links.filter((l) => isExpiring(l)).sort((a, b) => a.expiresAt!.localeCompare(b.expiresAt!));
  const dueReminders = sortReminders(data.reminders.filter((r) => isReminderDue(r)));

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 pt-3 pb-12 md:px-8 md:pt-6">
      <button
        type="button"
        onClick={ui.openPalette}
        className="flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-field px-3 text-faint md:hidden"
      >
        <Search size={18} className="text-icon" />
        搜索文档、项目、标签
      </button>

      {(inbox > 0 || expiring.length > 0 || dueReminders.length > 0) && (
        <div className="-mb-1 flex flex-col gap-2">
          {inbox > 0 && (
            <Banner action={<NextLink href="/inbox">去整理</NextLink>}>收件箱里有 {inbox} 个链接还没归类到项目</Banner>
          )}
          {expiring.length > 0 && (
            <Banner tone="warn" action={<NextLink href="/expiring">查看</NextLink>}>
              {expiringMessage(expiring)}
            </Banner>
          )}
          {dueReminders.length > 0 && (
            <Banner
              tone="warn"
              icon={<Bell size={16} className="shrink-0 text-warn" />}
              action={<NextLink href="/reminders">查看</NextLink>}
            >
              {reminderMessage(dueReminders)}
            </Banner>
          )}
        </div>
      )}

      <section aria-labelledby="quick-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="quick-title" className="text-base leading-6 font-semibold">
            快速访问
          </h2>
          <NextLink href="/favorites" className="text-[13px] text-muted hover:text-accent-text">
            管理收藏
          </NextLink>
        </div>
        {favorites.length ? (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(196px,1fr))] md:gap-4 md:overflow-visible md:px-0 md:pb-0">
            {favorites.map((l) => (
              <QuickCard key={l.id} link={l} project={label(l)} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-faint">
            把常用的文档设为收藏（链接的「更多」菜单里），会显示在这里，一点就能打开
          </p>
        )}
      </section>

      <section aria-label="文档列表" className="flex flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-line">
          <Tabs
            label="文档列表"
            value={tab}
            onChange={setTab}
            items={[
              { value: "recent", label: "最近访问" },
              { value: "added", label: "最近添加" },
            ]}
          />
          <NextLink
            href={tab === "recent" ? "/recent" : "/all"}
            className="shrink-0 text-[13px] text-muted hover:text-accent-text"
          >
            查看全部
          </NextLink>
        </div>
        {lists[tab].length === 0 ? (
          <p className="py-10 text-center text-[13px] text-faint">打开过的链接会显示在这里</p>
        ) : (
          <div className="md:overflow-x-auto">
            <div className="md:min-w-[720px]">
              <div className="hidden h-10 grid-cols-[minmax(0,2.6fr)_minmax(0,1.5fr)_minmax(0,1.3fr)_120px] items-center gap-4 border-b border-line-soft px-3 text-[13px] text-faint md:grid">
                <span>名称</span>
                <span>所在项目</span>
                <span>状态</span>
                <span className="text-right">{tab === "recent" ? "最近打开" : "添加时间"}</span>
              </div>
              {lists[tab].map((l) => (
                <HomeRow
                  key={l.id}
                  link={l}
                  project={label(l)}
                  time={shortTime(tab === "recent" ? l.lastVisitedAt! : l.createdAt)}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** 例如：3 个分享链接即将到期或已过期，其中「合同扫描件」已于 10月10日 过期 */
function expiringMessage(links: Link[]): string {
  const head = `${links.length} 个分享链接即将到期或已过期`;
  const expired = links.filter((l) => daysUntil(l.expiresAt!) < 0);
  if (expired.length) {
    const last = expired[expired.length - 1];
    return `${head}，其中「${last.title}」已于 ${shortDate(last.expiresAt!)} 过期`;
  }
  const first = links[0];
  return `${head}，最近的「${first.title}」${expiryInfo(first.expiresAt!).label}`;
}

function reminderMessage(list: Reminder[]): string {
  const first = list[0];
  const what = `「${first.title}」${reminderState(first).label}`;
  return list.length === 1 ? `提醒：${what}` : `${list.length} 个提醒需要处理，最近的${what}`;
}

function OpenLink({ link, className, children }: { link: Link; className?: string; children: ReactNode }) {
  const actions = useLinkActions();
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => actions.afterOpen(link)}
      onAuxClick={(e) => e.button === 1 && actions.afterOpen(link)}
      className={className}
    >
      {children}
    </a>
  );
}

function QuickCard({ link, project }: { link: Link; project: string }) {
  return (
    <OpenLink
      link={link}
      className="flex w-40 shrink-0 flex-col gap-3 rounded-lg border border-line-strong bg-surface p-3.5 transition-shadow hover:shadow-card md:w-auto"
    >
      <span className="flex items-start justify-between">
        <DocIcon url={link.url} size={36} />
        <StarIcon size={15} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium" title={link.title}>
          {link.title}
        </span>
        <span className="truncate text-xs leading-5 text-faint">{platformLabel(link.url)}</span>
      </span>
      <span className="flex items-center justify-between gap-2 border-t border-line-soft pt-2.5 text-xs leading-5 text-muted">
        <span className="truncate">{project}</span>
        {link.accessCode && (
          <span className="shrink-0 rounded border border-line-strong px-1.5 font-mono text-fg">{link.accessCode}</span>
        )}
      </span>
    </OpenLink>
  );
}

function HomeRow({ link, project, time }: { link: Link; project: string; time: string }) {
  const actions = useLinkActions();
  return (
    <div className="relative flex min-h-[60px] items-center gap-3 border-b border-line-soft md:grid md:min-h-[52px] md:grid-cols-[minmax(0,2.6fr)_minmax(0,1.5fr)_minmax(0,1.3fr)_120px] md:gap-4 md:px-3 md:hover:bg-hover">
      <span className="flex min-w-0 flex-1 items-center gap-3 md:gap-2.5">
        <DocIcon url={link.url} size={28} className="max-md:size-[34px]! max-md:rounded-lg!" />
        <span className="flex min-w-0 flex-col">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => actions.afterOpen(link)}
            onAuxClick={(e) => e.button === 1 && actions.afterOpen(link)}
            title={link.title}
            className="truncate outline-none after:absolute after:inset-0 hover:text-accent-text focus-visible:after:ring-2 focus-visible:after:ring-accent"
          >
            {link.title}
          </a>
          <span className="truncate text-xs leading-[18px] text-faint">
            <span className="max-md:hidden">{platformLabel(link.url)}</span>
            <span className="md:hidden">
              {project} · {time}
            </span>
          </span>
        </span>
      </span>
      <span className="hidden min-w-0 items-center gap-2 text-muted md:flex">
        <ProjectDot id={link.projectId} />
        <span className="truncate">{project}</span>
      </span>
      <span className="flex shrink-0 flex-wrap gap-1 max-md:[&>*:not(:first-child)]:hidden">
        {link.accessCode && <CodeChip code={link.accessCode} />}
        {link.expiresAt && <ExpiryChip date={link.expiresAt} />}
      </span>
      <span className="hidden text-right text-[13px] text-faint md:block">{time}</span>
    </div>
  );
}

function Welcome({ hasGroups }: { hasGroups: boolean }) {
  const ui = useUI();
  const mod = useModKey();
  const steps: [string, ReactNode][] = [
    ["建好分组和项目", "例如分组「工作」下建项目「官网改版」，链接按项目归类"],
    ["添加链接", <>点「新建 → 添加链接」，或在页面任意位置直接 {mod} + V 粘贴链接、分享文案</>],
    [
      "随时找到",
      <>
        按 <Kbd>{mod} K</Kbd> 搜索，回车直接打开；网盘链接打开时会自动复制提取码
      </>,
    ],
  ];
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 pt-4 pb-12 md:px-8 md:pt-6">
      <EmptyState
        title="欢迎使用 MyDoc"
        actions={
          <>
            {!hasGroups && (
              <Button variant="primary" size="lg" onClick={() => ui.editGroup()}>
                <FolderPlus size={16} />
                新建分组
              </Button>
            )}
            <Button variant={hasGroups ? "primary" : "secondary"} size="lg" onClick={() => ui.addLink()}>
              <Plus size={16} />
              添加链接
            </Button>
            <Button size="lg" onClick={() => ui.importLinks()}>
              <Upload size={15} />
              批量导入
            </Button>
          </>
        }
      >
        <p>把散落在聊天记录里的共享文档、表格、网盘链接收集起来，分项目归类，一秒打开。</p>
        <ol className="mx-auto mt-6 flex max-w-md flex-col gap-4 text-left">
          {steps.map(([title, text], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-text">
                {i + 1}
              </span>
              <span>
                <span className="block font-medium text-fg">{title}</span>
                <span className="block text-[13px]">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </EmptyState>
    </div>
  );
}

/** 工作台加载中的骨架屏 */
function HomeSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 pt-4 md:px-8 md:pt-6">
      <p role="status" className="sr-only">
        正在加载工作台
      </p>
      <Skeleton className="h-10" />
      <section className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20 rounded-lg" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-4">
          {["78%", "62%", "84%", "70%", "58%"].map((w) => (
            <div key={w} className="flex flex-col gap-3 rounded-lg border border-line-soft p-3.5">
              <Skeleton className="size-9 rounded-lg" />
              <span className="flex flex-col gap-2">
                <Skeleton className="h-[13px]" style={{ width: w }} />
                <Skeleton className="h-2.5 w-[56%]" />
              </span>
              <span className="border-t border-line-soft pt-2.5">
                <Skeleton className="h-2.5 w-[64%]" />
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col">
        <div className="flex h-11 items-center gap-6 border-b border-line">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        {["42%", "56%", "38%", "50%", "44%", "34%", "48%"].map((w, i) => (
          <div key={i} className="flex h-14 items-center gap-3 border-b border-line-soft md:px-3">
            <Skeleton className="size-7 shrink-0 rounded-md" />
            <span className="flex flex-1 flex-col gap-1.5">
              <Skeleton style={{ width: w }} />
              <Skeleton className="h-2.5 w-[36%]" />
            </span>
            <Skeleton className="hidden w-16 md:block" />
          </div>
        ))}
      </section>
    </div>
  );
}
