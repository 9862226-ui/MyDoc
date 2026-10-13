"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { api, copyText, refreshData, shareText, trackVisit } from "@/lib/client";
import type { Group, Link, Project, Reminder } from "@/lib/types";

export interface LinkInit {
  url?: string;
  title?: string;
  accessCode?: string;
  projectId?: number | null;
  tags?: string[];
  note?: string;
  /** 来自粘贴的分享文案（添加窗口顶部会提示识别结果） */
  pasted?: boolean;
}

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  danger?: boolean;
}

export interface ToastOptions {
  kind?: "ok" | "error" | "info";
  action?: { label: string; onClick: () => void };
}

export interface UI {
  addLink(init?: LinkInit): void;
  editLink(link: Link): void;
  importLinks(init?: { text?: string }): void;
  openPalette(): void;
  editGroup(group?: Group): void;
  editProject(project?: Project, groupId?: number): void;
  addTagsTo(ids: number[], done?: () => void): void;
  editReminder(reminder?: Reminder): void;
  /** 把项目分享成只读链接 */
  shareProject(project: Project): void;
  /** 打开「AI 整理」，给这些链接出归类建议 */
  organizeWithAi(ids: number[]): void;
  /** 新添加了链接：开启了自动归类时让 AI 归类 */
  linkAdded(link: Link): void;
  confirm(options: ConfirmOptions): Promise<boolean>;
  toast(message: string, options?: ToastOptions): void;
  /** 当前页面对应的项目，新建链接时默认放进去 */
  defaultProjectId: number | null;
}

export const UIContext = createContext<UI | null>(null);

export function useUI(): UI {
  const ui = useContext(UIContext);
  if (!ui) throw new Error("useUI 必须在 AppShell 内使用");
  return ui;
}

/** 链接的常用操作，出错时自动提示 */
export function useLinkActions() {
  const ui = useUI();
  return useMemo(() => {
    const run = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        ui.toast((e as Error).message, { kind: "error" });
      }
    };

    const afterOpen = (link: Link) => {
      trackVisit(link.id);
      if (link.accessCode) {
        void copyText(link.accessCode).then((ok) => ok && ui.toast(`已复制提取码 ${link.accessCode}`));
      }
    };

    return {
      /** 在新标签页打开（用于键盘、按钮） */
      open(link: Link) {
        // 先复制提取码：新标签页打开后当前页面失去焦点，剪贴板就写不进去了
        afterOpen(link);
        window.open(link.url, "_blank", "noopener,noreferrer");
      },
      /** 点击 <a> 打开时调用（浏览器自己负责打开） */
      afterOpen,
      async copy(link: Link, withTitle = false) {
        const ok = await copyText(shareText(link, withTitle));
        ui.toast(ok ? (link.accessCode ? "已复制链接和提取码" : "已复制链接") : "复制失败", {
          kind: ok ? "ok" : "error",
        });
      },
      toggleFavorite: (link: Link) =>
        run(async () => {
          await api(`/api/links/${link.id}`, { method: "PATCH", body: { favorite: !link.favorite } });
          await refreshData();
        }),
      togglePin: (link: Link) =>
        run(async () => {
          await api(`/api/links/${link.id}`, { method: "PATCH", body: { pinned: !link.pinned } });
          await refreshData();
        }),
      remove: (ids: number[]) =>
        run(async () => {
          await api("/api/links/batch", { body: { ids, op: { action: "delete" } } });
          await refreshData();
          ui.toast(`已移到回收站（${ids.length} 个）`, {
            action: {
              label: "撤销",
              onClick: () =>
                void run(async () => {
                  await api("/api/links/batch", { body: { ids, op: { action: "restore" } } });
                  await refreshData();
                }),
            },
          });
        }),
      move: (ids: number[], projectId: number | null, targetName: string) =>
        run(async () => {
          await api("/api/links/batch", { body: { ids, op: { action: "move", projectId } } });
          await refreshData();
          ui.toast(`已移动 ${ids.length} 个链接到「${targetName}」`);
        }),
      batch: (ids: number[], op: Record<string, unknown>) =>
        run(async () => {
          await api("/api/links/batch", { body: { ids, op } });
          await refreshData();
        }),
    };
  }, [ui]);
}
