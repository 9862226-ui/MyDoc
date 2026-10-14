"use client";

import {
  ClipboardList,
  Copy,
  ExternalLink,
  ListChecks,
  Pencil,
  Pin,
  PinOff,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import NextLink from "next/link";
import type { DragEvent } from "react";
import { copyText } from "@/lib/client";
import { expiryInfo, shortTime } from "@/lib/format";
import { plainText } from "@/lib/md-edit";
import { platformLabel } from "@/lib/platforms";
import type { Link } from "@/lib/types";
import { Checkbox, cx, DocIcon, IconButton, Menu, ProjectDot, StarIcon, Tag, type MenuItem } from "./ui";
import { useLinkActions, useUI } from "./ui-context";

export interface LinkItemProps {
  link: Link;
  /** 不在项目视图里时，显示所在项目 */
  project?: { id: number | null; label: string };
  selected: boolean;
  selecting: boolean;
  /** 选中或取消；shift 为真时选中一段 */
  onSelect: (shift: boolean) => void;
  onDragStart: (e: DragEvent) => void;
}

/** 列表视图的列宽：勾选 / 名称 / (所在项目) / 标签 / 状态 / 最近打开 / 操作 */
const COLS = "md:grid-cols-[28px_minmax(0,3fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_110px_72px]";
const COLS_WITH_PROJECT =
  "md:grid-cols-[28px_minmax(0,2.6fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_110px_72px]";

function useItemMenu(link: Link, onSelect?: () => void): MenuItem[] {
  const ui = useUI();
  const actions = useLinkActions();
  return [
    { label: "打开", icon: <ExternalLink size={15} />, onSelect: () => actions.open(link) },
    { label: "编辑", icon: <Pencil size={15} />, onSelect: () => ui.editLink(link) },
    { divider: true },
    {
      label: link.accessCode ? "复制链接和提取码" : "复制链接",
      icon: <Copy size={15} />,
      onSelect: () => void actions.copy(link),
    },
    { label: "复制为分享文本", icon: <ClipboardList size={15} />, onSelect: () => void actions.copy(link, true) },
    {
      label: link.favorite ? "取消收藏" : "收藏",
      icon: link.favorite ? <StarOff size={15} /> : <Star size={15} />,
      onSelect: () => void actions.toggleFavorite(link),
    },
    {
      label: link.pinned ? "取消置顶" : "置顶",
      icon: link.pinned ? <PinOff size={15} /> : <Pin size={15} />,
      onSelect: () => void actions.togglePin(link),
    },
    { label: "多选", icon: <ListChecks size={15} />, onSelect: () => onSelect?.(), hidden: !onSelect },
    { divider: true },
    { label: "删除", icon: <Trash2 size={15} />, danger: true, onSelect: () => void actions.remove([link.id]) },
  ];
}

/** 标题链接；after 伪元素铺满整行 / 整张卡片，点哪里都能打开 */
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
      className={cx("truncate outline-none after:absolute after:inset-0 hover:text-accent-text", className)}
      title={link.note ? `${link.title}\n${link.note}` : link.title}
    >
      {link.title}
    </a>
  );
}

/** 点击复制提取码 */
export function CodeChip({ code, label = true, className }: { code: string; label?: boolean; className?: string }) {
  const ui = useUI();
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(code);
        ui.toast(ok ? `已复制提取码 ${code}` : "复制失败", { kind: ok ? "ok" : "error" });
      }}
      title="点击复制提取码"
      className={cx(
        "relative z-10 inline-flex h-5 shrink-0 cursor-pointer items-center rounded border border-line-strong px-1.5 font-mono text-xs text-fg transition-colors hover:border-accent hover:text-accent-text",
        className,
      )}
    >
      {label && "提取码 "}
      {code}
    </button>
  );
}

export function ExpiryChip({ date }: { date: string }) {
  const info = expiryInfo(date);
  return (
    <Tag
      tone={info.level === "expired" ? "danger" : info.level === "soon" ? "warn" : "default"}
      title={`到期日期 ${date}`}
    >
      {info.label}
    </Tag>
  );
}

export function TagLink({ name, className }: { name: string; className?: string }) {
  return (
    <NextLink
      href={`/t/${encodeURIComponent(name)}`}
      draggable={false}
      className={cx(
        "relative z-10 inline-flex max-w-full shrink-0 items-center truncate rounded bg-field px-1.5 text-xs leading-5 text-muted hover:text-accent-text",
        className,
      )}
    >
      {name}
    </NextLink>
  );
}

function visitedLabel(link: Link): string {
  return link.lastVisitedAt ? shortTime(link.lastVisitedAt) : "未打开";
}

/** 列表视图的表头 */
export function LinkTableHeader({
  showProject,
  checked,
  indeterminate,
  onToggleAll,
}: {
  showProject: boolean;
  checked: boolean;
  indeterminate: boolean;
  onToggleAll: () => void;
}) {
  return (
    <div
      className={cx(
        "hidden h-10 items-center gap-4 border-b border-line px-3 text-[13px] text-faint md:grid",
        showProject ? COLS_WITH_PROJECT : COLS,
      )}
    >
      <Checkbox checked={checked} indeterminate={indeterminate} onChange={onToggleAll} aria-label="全选" />
      <span>名称</span>
      {showProject && <span>所在项目</span>}
      <span>标签</span>
      <span>状态</span>
      <span className="text-right">最近打开</span>
      <span />
    </div>
  );
}

/** 列表视图的一行；手机上变成两行文字的紧凑列表 */
export function LinkRow({ link, project, selected, selecting, onSelect, onDragStart }: LinkItemProps) {
  const actions = useLinkActions();
  const menu = useItemMenu(link, () => onSelect(false));
  const hasStatus = !!(link.accessCode || link.expiresAt);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cx(
        "group/row relative flex items-center gap-3 border-b border-line-soft py-3 max-md:-mx-4 max-md:px-4 md:grid md:min-h-14 md:gap-4 md:px-3 md:py-2",
        project ? COLS_WITH_PROJECT : COLS,
        selected ? "bg-accent-soft" : "md:hover:bg-hover",
      )}
    >
      <span className={cx("relative z-10 flex items-center", !selecting && "max-md:hidden")}>
        <Checkbox
          checked={selected}
          onChange={() => {}}
          onClick={(e) => onSelect(e.shiftKey)}
          aria-label={`选择 ${link.title}`}
        />
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-3 md:gap-2.5">
        <DocIcon url={link.url} size={30} />
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <TitleLink link={link} className="max-md:font-medium" />
            {link.pinned && <Tag tone="pin">置顶</Tag>}
            {link.favorite && <StarIcon size={13} />}
          </span>
          <span className="truncate text-xs leading-[18px] text-faint">
            {platformLabel(link.url)}
            {project && <span className="md:hidden"> · {project.label}</span>}
            <span className="md:hidden">
              {" · "}
              {link.lastVisitedAt ? `${shortTime(link.lastVisitedAt)} 打开` : "还没打开过"}
            </span>
          </span>
          {hasStatus && (
            <span className="mt-1 flex flex-wrap gap-1 md:hidden">
              {link.accessCode && <CodeChip code={link.accessCode} />}
              {link.expiresAt && <ExpiryChip date={link.expiresAt} />}
            </span>
          )}
        </span>
      </span>

      {project && (
        <span className="hidden min-w-0 items-center gap-2 text-muted md:flex">
          <ProjectDot id={project.id} />
          <NextLink
            href={project.id === null ? "/inbox" : `/p/${project.id}`}
            draggable={false}
            className="relative z-10 truncate hover:text-accent-text"
          >
            {project.label}
          </NextLink>
        </span>
      )}

      <span className="hidden min-w-0 flex-wrap gap-1 md:flex">
        {link.tags.map((t) => (
          <TagLink key={t} name={t} />
        ))}
      </span>

      <span className="hidden min-w-0 flex-wrap gap-1 md:flex">
        {link.accessCode && <CodeChip code={link.accessCode} />}
        {link.expiresAt && <ExpiryChip date={link.expiresAt} />}
      </span>

      <span className={cx("hidden text-right text-[13px] md:block", link.lastVisitedAt ? "text-muted" : "text-faint")}>
        {visitedLabel(link)}
      </span>

      <span className="relative z-10 flex shrink-0 justify-end gap-0.5 focus-within:opacity-100 pointer-coarse:opacity-100 md:opacity-0 md:group-hover/row:opacity-100">
        <IconButton
          label={link.accessCode ? "复制链接和提取码" : "复制链接"}
          size="sm"
          className="max-md:hidden"
          onClick={() => void actions.copy(link)}
        >
          <Copy size={15} />
        </IconButton>
        <Menu items={menu} className="size-7" />
      </span>
    </div>
  );
}

/** 卡片视图 */
export function LinkCard({ link, project, selected, selecting, onSelect, onDragStart }: LinkItemProps) {
  const menu = useItemMenu(link, () => onSelect(false));
  const expiry = link.expiresAt ? expiryInfo(link.expiresAt) : null;

  return (
    <article
      draggable
      onDragStart={onDragStart}
      className={cx(
        "group/card relative flex flex-col gap-3.5 rounded-lg border bg-surface p-4 transition-[box-shadow,border-color]",
        selected ? "border-accent ring-2 ring-accent/20" : "border-line-strong hover:shadow-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="relative">
          <DocIcon url={link.url} size={44} />
          <span
            className={cx(
              "absolute -top-2 -left-2 z-10 flex rounded bg-surface p-0.5 shadow-[0_1px_3px_var(--shadow)]",
              !selecting && !selected && "opacity-0 group-hover/card:opacity-100 focus-within:opacity-100",
            )}
          >
            <Checkbox
              checked={selected}
              onChange={() => {}}
              onClick={(e) => onSelect(e.shiftKey)}
              aria-label={`选择 ${link.title}`}
            />
          </span>
        </span>
        <span className="flex items-center gap-1.5 pointer-coarse:mr-8">
          {link.pinned && <Tag tone="pin">置顶</Tag>}
          {link.favorite && <StarIcon size={16} />}
        </span>
        {/* 悬停时盖在置顶 / 星标上方 */}
        <span className="absolute top-3 right-3 z-10 rounded-md bg-surface opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
          <Menu items={menu} className="size-7" />
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        <TitleLink link={link} className="text-[15px] font-medium after:rounded-lg" />
        <span className="truncate text-xs leading-5 text-faint">{platformLabel(link.url)}</span>
      </div>

      {link.note && <p className="-mt-1.5 line-clamp-2 text-[13px] text-muted">{plainText(link.note)}</p>}

      <dl className="flex flex-col gap-1.5 border-t border-line-soft pt-3 text-[13px]">
        {project && (
          <div className="flex justify-between gap-2">
            <dt className="shrink-0 text-faint">所在项目</dt>
            <dd className="min-w-0 truncate">
              <NextLink
                href={project.id === null ? "/inbox" : `/p/${project.id}`}
                draggable={false}
                className="relative z-10 hover:text-accent-text"
              >
                {project.label}
              </NextLink>
            </dd>
          </div>
        )}
        {link.accessCode && (
          <div className="flex justify-between gap-2">
            <dt className="text-faint">提取码</dt>
            <dd>
              <CodeChip code={link.accessCode} label={false} className="h-auto border-0 px-0 text-[13px]" />
            </dd>
          </div>
        )}
        {expiry && (
          <div className="flex justify-between gap-2">
            <dt className="text-faint">有效期</dt>
            <dd
              className={cx(
                expiry.level === "expired"
                  ? "text-danger-text"
                  : expiry.level === "soon"
                    ? "text-warn-text"
                    : "text-fg",
              )}
            >
              {expiry.label}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-faint">最近打开</dt>
          <dd className={link.lastVisitedAt ? "" : "text-faint"}>{visitedLabel(link)}</dd>
        </div>
      </dl>

      {link.tags.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1">
          {link.tags.map((t) => (
            <TagLink key={t} name={t} className="leading-[22px]" />
          ))}
        </div>
      )}
    </article>
  );
}
