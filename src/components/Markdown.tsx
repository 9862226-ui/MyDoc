"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { cx } from "./ui";

/**
 * 显示 Markdown 内容。传了 onToggleTask 时待办可以直接打勾（参数是第几个待办），否则只读。
 * 渲染结果不含原始 HTML（见 lib/markdown），可以直接放进页面
 */
export function Markdown({
  text,
  onToggleTask,
  className,
}: {
  text: string;
  onToggleTask?: (index: number) => void;
  className?: string;
}) {
  const router = useRouter();
  const html = useMemo(() => {
    const out = renderMarkdown(text);
    return onToggleTask ? out : out.replaceAll('class="md-task"', 'class="md-task" disabled');
  }, [text, onToggleTask]);
  return (
    <div
      className={cx("markdown", className)}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        // 站内的引用不整页刷新（链接类型的引用在新标签页打开，交给浏览器）
        const a = t.closest("a.md-ref");
        if (a instanceof HTMLAnchorElement && !a.target && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          router.push(a.getAttribute("href")!);
          return;
        }
        if (onToggleTask && t instanceof HTMLInputElement && t.dataset.task) {
          e.preventDefault();
          onToggleTask(Number(t.dataset.task));
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
