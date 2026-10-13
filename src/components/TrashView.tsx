"use client";

import { Trash2, Undo2 } from "lucide-react";
import { mutate } from "swr";
import { api, refreshData, TRASH_KEY, useAppData, useTrash } from "@/lib/client";
import { shortTime } from "@/lib/format";
import { platformLabel } from "@/lib/platforms";
import type { Link } from "@/lib/types";
import { projectIndex, projectPathLabel } from "@/lib/view";
import { Banner, Button, DocIcon, EmptyState, IconButton, Skeleton } from "./ui";
import { useUI } from "./ui-context";

const KEEP_DAYS = 30;

const daysLeft = (deletedAt: string) =>
  Math.max(0, KEEP_DAYS - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400_000));

export function TrashView() {
  const { data: links, error } = useTrash();
  const { data } = useAppData();
  const ui = useUI();
  const index = data ? projectIndex(data) : null;

  const run = async (fn: () => Promise<unknown>, message?: string) => {
    try {
      await fn();
      await Promise.all([mutate(TRASH_KEY), refreshData()]);
      if (message) ui.toast(message);
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const restore = (l: Link) =>
    run(() => api("/api/links/batch", { body: { ids: [l.id], op: { action: "restore" } } }), `已恢复「${l.title}」`);

  const purge = async (l: Link) => {
    const ok = await ui.confirm({
      title: "彻底删除这个链接？",
      message: `「${l.title}」将无法恢复。`,
      confirmText: "彻底删除",
      danger: true,
    });
    if (ok) void run(() => api("/api/links/batch", { body: { ids: [l.id], op: { action: "purge" } } }), "已彻底删除");
  };

  const emptyTrash = async () => {
    const ok = await ui.confirm({
      title: "清空回收站？",
      message: `${links!.length} 个链接将被彻底删除，无法恢复。`,
      confirmText: "清空",
      danger: true,
    });
    if (ok) void run(() => api(TRASH_KEY, { method: "DELETE" }), "回收站已清空");
  };

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pt-4 pb-12 md:px-8 md:pt-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-[#8F959E] text-white md:size-12"
        >
          <Trash2 size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="hidden text-xl leading-7 font-semibold md:block">回收站</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            删除的链接保留 {KEEP_DAYS} 天，之后自动彻底删除{links?.length ? ` · ${links.length} 个` : ""}
          </p>
        </div>
        {!!links?.length && (
          <Button variant="dangerGhost" className="shrink-0 border border-danger/40" onClick={() => void emptyTrash()}>
            清空回收站
          </Button>
        )}
      </div>

      {error && !links ? (
        <Banner tone="danger">加载失败：{error.message}</Banner>
      ) : !links ? (
        <div className="flex flex-col">
          {[48, 36, 56].map((w) => (
            <div key={w} className="flex h-14 items-center gap-3 border-b border-line-soft md:px-3">
              <Skeleton className="size-[30px] rounded-[7px]" />
              <Skeleton style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      ) : links.length === 0 ? (
        <EmptyState illustration="trash" title="回收站是空的">
          删除的链接会在这里保留 {KEEP_DAYS} 天，期间可以随时恢复
        </EmptyState>
      ) : (
        <div className="md:overflow-x-auto">
          <div className="md:min-w-[720px]">
            <div className="hidden h-10 grid-cols-[minmax(0,2.6fr)_minmax(0,1.4fr)_110px_100px_150px] items-center gap-4 border-b border-line px-3 text-[13px] text-faint md:grid">
              <span>名称</span>
              <span>原来所在</span>
              <span>删除时间</span>
              <span>自动清除</span>
              <span />
            </div>
            {links.map((l) => {
              const where = projectPathLabel(l.projectId === null || !index ? undefined : index.get(l.projectId));
              const left = daysLeft(l.deletedAt!);
              return (
                <div
                  key={l.id}
                  className="flex items-center gap-3 border-b border-line-soft py-3 md:grid md:min-h-14 md:grid-cols-[minmax(0,2.6fr)_minmax(0,1.4fr)_110px_100px_150px] md:gap-4 md:px-3 md:py-2 md:hover:bg-hover"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3 md:gap-2.5">
                    <DocIcon url={l.url} size={30} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate" title={l.title}>
                        {l.title}
                      </span>
                      <span className="truncate text-xs leading-[18px] text-faint">
                        {platformLabel(l.url)}
                        <span className="md:hidden">
                          {" · "}
                          {left} 天后清除
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="hidden truncate text-muted md:block">{where}</span>
                  <span className="hidden text-[13px] text-muted md:block">{shortTime(l.deletedAt!)}</span>
                  <span
                    className={
                      left <= 3
                        ? "hidden text-[13px] text-warn-text md:block"
                        : "hidden text-[13px] text-faint md:block"
                    }
                  >
                    {left} 天后
                  </span>
                  <span className="flex shrink-0 items-center justify-end gap-1">
                    <Button size="sm" onClick={() => void restore(l)}>
                      <Undo2 size={14} />
                      恢复
                    </Button>
                    <IconButton
                      label="彻底删除"
                      size="sm"
                      className="hover:text-danger-text"
                      onClick={() => void purge(l)}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
