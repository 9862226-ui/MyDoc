"use client";

import { Copy, Eye, KeyRound, Pencil, Pin, PinOff, Star, Trash2, ExternalLink, ClipboardList } from "lucide-react";
import NextLink from "next/link";
import type { DragEvent, MouseEvent } from "react";
import { copyText } from "@/lib/client";
import { expiryInfo, relativeTime } from "@/lib/format";
import { hostOf, platformLabel } from "@/lib/platforms";
import type { Link } from "@/lib/types";
import { cx, IconButton, Menu, PlatformIcon, type MenuItem } from "./ui";
import { useLinkActions, useUI } from "./ui-context";

export interface LinkItemProps {
  link: Link;
  /** 不在项目视图里时，显示所在项目 */
  project?: { id: number | null; label: string };
  selected: boolean;
  selecting: boolean;
  onSelect: (e: MouseEvent) => void;
  onDragStart: (e: DragEvent) => void;
}

function useItemMenu(link: Link): MenuItem[] {
  const ui = useUI();
  const actions = useLinkActions();
  return [
    { label: "打开", icon: <ExternalLink size={14} />, onSelect: () => actions.open(link) },
    { label: "编辑", icon: <Pencil size={14} />, onSelect: () => ui.editLink(link) },
    { divider: true },
    { label: link.accessCode ? "复制链接和提取码" : "复制链接", icon: <Copy size={14} />, onSelect: () => void actions.copy(link) },
    { label: "复制为分享文本", icon: <ClipboardList size={14} />, onSelect: () => void actions.copy(link, true) },
    {
      label: link.pinned ? "取消置顶" : "置顶",
      icon: link.pinned ? <PinOff size={14} /> : <Pin size={14} />,
      onSelect: () => void actions.togglePin(link),
    },
    { divider: true },
    { label: "删除", icon: <Trash2 size={14} />, danger: true, onSelect: () => void actions.remove([link.id]) },
  ];
}

function TitleLink({ link, className }: { link: Link; className?: string }) {
  const actions = useLinkActions();
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      onClick={() => actions.afterOpen(link)}
      onAuxClick={(e) => e.button === 1 && actions.afterOpen(link)}
      className={className}
      title={link.title}
    >
      {link.pinned && <Pin size={13} className="mr-1 inline -translate-y-px text-accent" />}
      {link.title}
    </a>
  );
}

function Checkbox({ checked, onClick, className }: { checked: boolean; onClick: (e: MouseEvent) => void; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label="选择"
      onClick={onClick}
      className={cx(
        "relative z-10 flex size-[18px] items-center justify-center rounded border-[1.5px] transition",
        checked ? "border-accent bg-accent text-accent-fg" : "border-muted/60 bg-surface hover:border-accent",
        className,
      )}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function AccessCode({ link }: { link: Link }) {
  const ui = useUI();
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(link.accessCode);
        ui.toast(ok ? `已复制提取码 ${link.accessCode}` : "复制失败", { kind: ok ? "ok" : "error" });
      }}
      title="点击复制提取码"
      className="relative z-10 inline-flex h-6 items-center gap-1 rounded-md bg-surface-2 px-1.5 font-mono text-xs hover:bg-accent-soft hover:text-accent"
    >
      <KeyRound size={12} />
      {link.accessCode}
    </button>
  );
}

function Expiry({ date }: { date: string }) {
  const info = expiryInfo(date);
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center rounded-md px-1.5 text-xs",
        info.level === "expired" && "bg-danger-soft text-danger",
        info.level === "soon" && "bg-warn-soft text-warn",
        info.level === "later" && "text-muted",
      )}
    >
      {info.label}
    </span>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.map((t) => (
        <NextLink
          key={t}
          href={`/t/${encodeURIComponent(t)}`}
          draggable={false}
          className="relative z-10 inline-flex h-6 items-center rounded-md px-1.5 text-xs text-accent hover:bg-accent-soft"
        >
          #{t}
        </NextLink>
      ))}
    </>
  );
}

export function LinkCard({ link, project, selected, selecting, onSelect, onDragStart }: LinkItemProps) {
  const actions = useLinkActions();
  const menu = useItemMenu(link);
  const host = hostOf(link.url);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cx(
        "group/card relative flex flex-col sm:min-h-36 rounded-xl border bg-surface p-3.5 transition",
        selected ? "border-accent ring-2 ring-accent/25" : "border-line hover:border-accent/40 hover:shadow-sm",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <PlatformIcon url={link.url} size={36} />
          <Checkbox
            checked={selected}
            onClick={onSelect}
            className={cx(
              "absolute -top-1.5 -left-1.5",
              !selecting && !selected && "opacity-0 group-hover/card:opacity-100 focus:opacity-100",
            )}
          />
        </div>
        <div className="min-w-0 flex-1 pr-14">
          <TitleLink
            link={link}
            className="line-clamp-2 leading-snug font-medium break-all outline-none after:absolute after:inset-0 after:rounded-xl hover:text-accent focus-visible:after:ring-2 focus-visible:after:ring-accent"
          />
          <div className="mt-0.5 truncate text-xs text-muted" title={link.url}>
            {platformLabel(link.url)} · {host}
          </div>
        </div>
      </div>

      <div className="absolute top-2.5 right-2 z-10 flex items-center">
        <IconButton
          label={link.favorite ? "取消收藏" : "收藏"}
          onClick={() => void actions.toggleFavorite(link)}
          className={cx(
            "size-7",
            link.favorite ? "text-amber-500 hover:text-amber-500" : "opacity-0 group-hover/card:opacity-100 focus:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          <Star size={15} fill={link.favorite ? "currentColor" : "none"} />
        </IconButton>
        <span className="opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
          <Menu items={menu} className="size-7" />
        </span>
      </div>

      {link.note && <p className="mt-2 line-clamp-2 text-[13px] text-muted">{link.note}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
        {link.accessCode && <AccessCode link={link} />}
        {link.expiresAt && <Expiry date={link.expiresAt} />}
        <TagChips tags={link.tags} />
        <span className="ml-auto flex items-center gap-2 pl-1 text-xs text-muted">
          {project && (
            <NextLink
              href={project.id === null ? "/inbox" : `/p/${project.id}`}
              draggable={false}
              className="relative z-10 max-w-32 truncate hover:text-accent"
              title={project.label}
            >
              {project.label}
            </NextLink>
          )}
          <span className="inline-flex items-center gap-0.5" title={`访问 ${link.visitCount} 次，最近：${relativeTime(link.lastVisitedAt)}`}>
            <Eye size={12} />
            {link.visitCount}
          </span>
        </span>
      </div>
    </div>
  );
}

export function LinkRow({ link, project, selected, selecting, onSelect, onDragStart }: LinkItemProps) {
  const actions = useLinkActions();
  const menu = useItemMenu(link);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cx(
        "group/row relative flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0",
        selected ? "bg-accent-soft" : "hover:bg-surface-2",
      )}
    >
      <Checkbox
        checked={selected}
        onClick={onSelect}
        className={cx(!selecting && !selected && "opacity-0 group-hover/row:opacity-100 focus:opacity-100 pointer-coarse:opacity-100")}
      />
      <PlatformIcon url={link.url} size={26} />
      <div className="min-w-0 flex-1">
        <TitleLink
          link={link}
          className="block truncate font-medium outline-none after:absolute after:inset-0 hover:text-accent focus-visible:underline"
        />
        <div className="flex items-center gap-1.5 truncate text-xs text-muted">
          <span className="truncate">{platformLabel(link.url)}</span>
          {project && (
            <>
              <span>·</span>
              <NextLink
                href={project.id === null ? "/inbox" : `/p/${project.id}`}
                draggable={false}
                className="relative z-10 truncate hover:text-accent"
              >
                {project.label}
              </NextLink>
            </>
          )}
        </div>
      </div>
      <div className="hidden max-w-60 shrink-0 flex-wrap justify-end gap-1 md:flex">
        <TagChips tags={link.tags.slice(0, 3)} />
      </div>
      {link.expiresAt && (
        <span className="hidden shrink-0 sm:block">
          <Expiry date={link.expiresAt} />
        </span>
      )}
      {link.accessCode && (
        <span className="hidden shrink-0 sm:block">
          <AccessCode link={link} />
        </span>
      )}
      <span className="hidden w-20 shrink-0 text-right text-xs text-muted lg:block" title="最近访问">
        {link.lastVisitedAt ? relativeTime(link.lastVisitedAt) : "未访问"}
      </span>
      <span className="relative z-10 flex shrink-0 items-center">
        <IconButton
          label={link.favorite ? "取消收藏" : "收藏"}
          onClick={() => void actions.toggleFavorite(link)}
          className={cx(
            "size-7",
            link.favorite ? "text-amber-500 hover:text-amber-500" : "opacity-0 group-hover/row:opacity-100 focus:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          <Star size={15} fill={link.favorite ? "currentColor" : "none"} />
        </IconButton>
        <span className="opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
          <Menu items={menu} className="size-7" />
        </span>
      </span>
    </div>
  );
}
