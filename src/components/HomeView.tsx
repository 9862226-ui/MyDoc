"use client";

import { AlarmClock, ArrowRight, Clock, FolderPlus, Inbox, Plus, Search, Star, Upload } from "lucide-react";
import NextLink from "next/link";
import type { ReactNode } from "react";
import { useAppData } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { platformLabel } from "@/lib/platforms";
import type { Link } from "@/lib/types";
import { isExpiring, projectIndex, projectPathLabel } from "@/lib/view";
import { Button, Kbd, PlatformIcon, Spinner, useModKey } from "./ui";
import { useLinkActions, useUI } from "./ui-context";

export function HomeView() {
  const { data } = useAppData();
  const ui = useUI();
  const mod = useModKey();

  if (!data) {
    return (
      <div className="flex justify-center p-16 text-muted">
        <Spinner size={22} />
      </div>
    );
  }

  const index = projectIndex(data);
  const label = (l: Link) => projectPathLabel(l.projectId === null ? undefined : index.get(l.projectId));
  const pinned = data.links.filter((l) => l.favorite || l.pinned).sort((a, b) => b.visitCount - a.visitCount);
  const recent = data.links
    .filter((l) => l.lastVisitedAt)
    .sort((a, b) => b.lastVisitedAt!.localeCompare(a.lastVisitedAt!))
    .slice(0, 8);
  const added = [...data.links].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const inbox = data.links.filter((l) => l.projectId === null).length;
  const expiring = data.links.filter((l) => isExpiring(l)).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 pb-16 md:p-8">
      <button
        type="button"
        onClick={ui.openPalette}
        className="flex h-12 w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left text-muted shadow-sm transition hover:border-accent/50"
      >
        <Search size={18} />
        <span className="flex-1">搜索文档，回车直接打开…</span>
        <span className="hidden gap-1 sm:flex">
          <Kbd>{mod}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      {data.links.length === 0 ? (
        <Welcome hasGroups={data.groups.length > 0} />
      ) : (
        <>
          {(inbox > 0 || expiring > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {inbox > 0 && (
                <Notice href="/inbox" icon={<Inbox size={18} />}>
                  收件箱有 <b>{inbox}</b> 个链接还没归类
                </Notice>
              )}
              {expiring > 0 && (
                <Notice href="/expiring" icon={<AlarmClock size={18} />} warn>
                  <b>{expiring}</b> 个分享链接快到期或已过期
                </Notice>
              )}
            </div>
          )}

          {pinned.length > 0 && (
            <Section title="收藏与置顶" icon={<Star size={16} />} href="/favorites">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {pinned.slice(0, 9).map((l) => (
                  <QuickLink key={l.id} link={l} sub={label(l)} />
                ))}
              </div>
            </Section>
          )}

          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="最近访问" icon={<Clock size={16} />} href="/recent">
              {recent.length ? (
                <div className="space-y-1">
                  {recent.map((l) => (
                    <QuickLink key={l.id} link={l} sub={`${label(l)} · ${relativeTime(l.lastVisitedAt)}`} plain />
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted">打开过的链接会显示在这里</p>
              )}
            </Section>
            <Section title="最近添加" icon={<Plus size={16} />} href="/all">
              <div className="space-y-1">
                {added.map((l) => (
                  <QuickLink key={l.id} link={l} sub={`${label(l)} · ${relativeTime(l.createdAt)}`} plain />
                ))}
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

function Welcome({ hasGroups }: { hasGroups: boolean }) {
  const ui = useUI();
  const steps: [string, ReactNode][] = [
    ["建好分组和项目", "例如分组「工作」下建项目「官网改版」，链接按项目归类"],
    ["添加链接", "点「添加链接」，或在页面任意位置直接 Ctrl+V 粘贴链接 / 分享文案"],
    ["随时找到", "按 Ctrl+K 搜索，回车直接打开；网盘链接会自动复制提取码"],
  ];
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 md:p-8">
      <h1 className="text-xl font-semibold">欢迎使用 MyDoc 👋</h1>
      <p className="mt-1 text-[13px] text-muted">把散落在聊天记录里的共享文档链接收集起来，分门别类，一秒打开。</p>
      <ol className="mt-6 space-y-4">
        {steps.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              {i + 1}
            </span>
            <div>
              <div className="font-medium">{title}</div>
              <div className="text-[13px] text-muted">{text}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-2">
        {!hasGroups && (
          <Button variant="primary" onClick={() => ui.editGroup()}>
            <FolderPlus size={16} />
            新建分组
          </Button>
        )}
        <Button variant={hasGroups ? "primary" : "secondary"} onClick={() => ui.addLink()}>
          <Plus size={16} />
          添加链接
        </Button>
        <Button onClick={() => ui.importLinks()}>
          <Upload size={15} />
          批量导入
        </Button>
      </div>
    </div>
  );
}

function Notice({ href, icon, warn, children }: { href: string; icon: ReactNode; warn?: boolean; children: ReactNode }) {
  return (
    <NextLink
      href={href}
      className={
        "flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] transition hover:brightness-95 " +
        (warn ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")
      }
    >
      {icon}
      <span className="flex-1">{children}</span>
      <ArrowRight size={16} />
    </NextLink>
  );
}

function Section({ title, icon, href, children }: { title: string; icon: ReactNode; href: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="text-muted">{icon}</span>
          {title}
        </h2>
        <NextLink href={href} className="text-[13px] text-muted hover:text-accent">
          查看全部
        </NextLink>
      </div>
      {children}
    </section>
  );
}

function QuickLink({ link, sub, plain }: { link: Link; sub: string; plain?: boolean }) {
  const actions = useLinkActions();
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => actions.afterOpen(link)}
      onAuxClick={(e) => e.button === 1 && actions.afterOpen(link)}
      title={`${link.title}\n${platformLabel(link.url)}`}
      className={
        "flex items-center gap-3 rounded-lg px-3 py-2 transition " +
        (plain ? "hover:bg-surface" : "border border-line bg-surface hover:border-accent/40 hover:shadow-sm")
      }
    >
      <PlatformIcon url={link.url} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{link.title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      {link.accessCode && (
        <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">{link.accessCode}</span>
      )}
    </a>
  );
}
