"use client";

import { CircleCheck, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { mutate as revalidate } from "swr";
import { api, copyText } from "@/lib/client";
import type { DayStatus, WeekStatus } from "@/lib/worklog";
import { Button, cx } from "./ui";
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

/** 改了数据后，日报、周报、日历、列表都要刷新 */
export const refreshWork = () => revalidate((k) => typeof k === "string" && k.startsWith("/api/work"));

/** 标记 / 取消「已提交到公司系统」 */
export function useSubmit() {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const set = async (kind: "daily" | "weekly", key: string, on: boolean, label: string) => {
    setBusy(true);
    try {
      await api("/api/work/reports", {
        method: "PUT",
        body: { kind, key, fields: { submittedAt: on ? new Date().toISOString() : null } },
      });
      await refreshWork();
      if (on) {
        ui.toast(`${label}已标记为已提交`, {
          action: { label: "撤销", onClick: () => void set(kind, key, false, label) },
        });
      }
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
    setBusy(false);
  };
  return { busy, set };
}

/** 卡片标题右边的「标记已提交」按钮；已提交时显示绿色，点一下取消 */
export function SubmitButton({
  submitted,
  busy,
  disabled,
  onToggle,
}: {
  submitted: boolean;
  busy: boolean;
  disabled?: boolean;
  onToggle: (on: boolean) => void;
}) {
  return submitted ? (
    <Button
      size="sm"
      loading={busy}
      title="点一下取消已提交"
      onClick={() => onToggle(false)}
      className="border-success/40 text-success-text hover:bg-success-soft"
    >
      {!busy && <CircleCheck size={14} />}
      已提交
    </Button>
  ) : (
    <Button size="sm" variant="primary" loading={busy} disabled={disabled} onClick={() => onToggle(true)}>
      {!busy && <CircleCheck size={14} />}
      标记已提交
    </Button>
  );
}

const STATUS: Record<DayStatus | WeekStatus, { label: string; className: string }> = {
  submitted: { label: "已提交", className: "bg-success-soft text-success-text" },
  unsubmitted: { label: "未提交", className: "bg-warn-soft text-warn-text" },
  missed: { label: "漏记", className: "border border-dashed border-warn/70 text-warn-text" },
  curated: { label: "已整理", className: "bg-accent-soft text-accent-text" },
  uncurated: { label: "未整理", className: "bg-warn-soft text-warn-text" },
  empty: { label: "没有记录", className: "bg-chip text-faint" },
};

export function StatusBadge({ status }: { status: DayStatus | WeekStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded px-1.5 text-xs leading-5 whitespace-nowrap",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}
