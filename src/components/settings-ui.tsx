import type { ReactNode } from "react";

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
