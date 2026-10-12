"use client";

import { Trash2, Undo2 } from "lucide-react";
import { mutate } from "swr";
import { api, refreshData, TRASH_KEY, useTrash } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { platformLabel } from "@/lib/platforms";
import { Button, EmptyState, IconButton, PlatformIcon, Spinner } from "./ui";
import { useUI } from "./ui-context";

const KEEP_DAYS = 30;

export function TrashView() {
  const { data: links } = useTrash();
  const ui = useUI();

  const run = async (fn: () => Promise<unknown>, message?: string) => {
    try {
      await fn();
      await Promise.all([mutate(TRASH_KEY), refreshData()]);
      if (message) ui.toast(message);
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const daysLeft = (deletedAt: string) =>
    Math.max(0, KEEP_DAYS - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400_000));

  return (
    <div className="mx-auto max-w-5xl p-4 pb-16 md:p-8">
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Trash2 size={20} className="text-muted" />
            回收站
          </h1>
          <p className="mt-1 text-[13px] text-muted">删除的链接保留 {KEEP_DAYS} 天，之后自动彻底删除</p>
        </div>
        {!!links?.length && (
          <Button
            className="text-danger"
            onClick={async () => {
              const ok = await ui.confirm({
                title: "清空回收站？",
                message: `${links.length} 个链接将被彻底删除，无法恢复。`,
                confirmText: "清空",
                danger: true,
              });
              if (ok) void run(() => api(TRASH_KEY, { method: "DELETE" }), "回收站已清空");
            }}
          >
            清空回收站
          </Button>
        )}
      </div>

      {!links ? (
        <div className="flex justify-center p-16 text-muted">
          <Spinner size={22} />
        </div>
      ) : links.length === 0 ? (
        <EmptyState icon={<Trash2 size={32} />} title="回收站是空的" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {links.map((l) => (
            <div key={l.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
              <PlatformIcon url={l.url} size={26} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{l.title}</div>
                <div className="truncate text-xs text-muted">
                  {platformLabel(l.url)} · {relativeTime(l.deletedAt)}删除 · {daysLeft(l.deletedAt!)} 天后自动清除
                </div>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  void run(
                    () => api("/api/links/batch", { body: { ids: [l.id], op: { action: "restore" } } }),
                    "已恢复",
                  )
                }
              >
                <Undo2 size={14} />
                恢复
              </Button>
              <IconButton
                label="彻底删除"
                className="hover:text-danger"
                onClick={async () => {
                  const ok = await ui.confirm({
                    title: "彻底删除这个链接？",
                    message: `「${l.title}」将无法恢复。`,
                    confirmText: "彻底删除",
                    danger: true,
                  });
                  if (ok)
                    void run(() => api("/api/links/batch", { body: { ids: [l.id], op: { action: "purge" } } }));
                }}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
