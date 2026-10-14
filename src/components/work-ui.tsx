"use client";

import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { copyText } from "@/lib/client";
import { cx } from "./ui";
import { useUI } from "./ui-context";

/** 工作记录里日报、周报共用的小组件 */

/** 复制并提示 */
export function useCopy() {
  const ui = useUI();
  return async (label: string, value: string) => {
    if (!value.trim()) return ui.toast(`「${label}」是空的`, { kind: "info" });
    const ok = await copyText(value);
    ui.toast(ok ? `已复制「${label}」` : "复制失败，请手动选择文字复制", { kind: ok ? "ok" : "error" });
  };
}

/** 一个可以复制的字段，样子接近公司系统里的一格 */
export function CopyCell({
  label,
  value,
  wide,
  mono,
}: {
  label: string;
  value: string | number;
  wide?: boolean;
  mono?: boolean;
}) {
  const copy = useCopy();
  const text = String(value);
  return (
    <div className={cx("group/cell min-w-0", wide && "col-span-full")}>
      <div className="text-xs text-faint">{label}</div>
      <button
        type="button"
        onClick={() => void copy(label, text)}
        title="点击复制"
        className={cx(
          "-mx-1.5 mt-0.5 flex w-[calc(100%+12px)] cursor-pointer items-start gap-1.5 rounded px-1.5 py-0.5 text-left hover:bg-hover",
          mono && "tabular-nums",
        )}
      >
        <span className={cx("min-w-0 flex-1 break-words", !text && "text-faint")}>{text || "—"}</span>
        <Copy
          size={13}
          className="mt-1 shrink-0 text-icon opacity-0 group-hover/cell:opacity-100 pointer-coarse:opacity-60"
        />
      </button>
    </div>
  );
}

export function ReportCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-5 rounded-xl border border-line bg-surface p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-6 font-semibold">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      {children}
    </section>
  );
}
