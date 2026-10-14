"use client";

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
  const html = useMemo(() => {
    const out = renderMarkdown(text);
    return onToggleTask ? out : out.replaceAll('class="md-task"', 'class="md-task" disabled');
  }, [text, onToggleTask]);
  return (
    <div
      className={cx("markdown", className)}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (onToggleTask && t instanceof HTMLInputElement && t.dataset.task) {
          e.preventDefault();
          onToggleTask(Number(t.dataset.task));
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
