import type { ReactNode } from "react";
import { shortTime } from "@/lib/format";
import { cx } from "./cx";

/** 设置页的卡片和行 */
export function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-surface px-5 py-5 md:px-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function Row({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft py-3.5 last:border-b-0 last:pb-1">
      <div className="min-w-0 flex-[1_1_240px]">
        <div className="font-medium">{title}</div>
        <div className="text-[13px] text-faint">{description}</div>
      </div>
      {children}
    </div>
  );
}

/** 一组胶囊样式的单选按钮 */
export function PillRadio<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 cursor-pointer rounded-md border px-3.5 transition-colors",
            value === o.value
              ? "border-accent bg-accent-soft text-accent-text"
              : "border-control bg-surface hover:border-accent/60",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 上次执行的结果：成功是灰色，失败是红色 */
export function LastResult({
  label,
  result,
}: {
  label: string;
  result?: { at: string; ok: boolean; message: string };
}) {
  if (!result) return null;
  return (
    <p className={cx("text-[13px]", result.ok ? "text-faint" : "text-danger-text")}>
      {label}：{shortTime(result.at)} {result.ok ? "成功" : "失败"}
      {result.message && `，${result.message}`}
    </p>
  );
}
