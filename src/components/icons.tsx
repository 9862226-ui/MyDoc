import type { ReactNode } from "react";
import { initialOf, projectColor } from "@/lib/colors";
import { DOC_KINDS, docKind, type DocKind } from "@/lib/platforms";
import { cx } from "./cx";
import { Favicon } from "./Favicon";

/** 文档类型图标里的白色图形（24×24 画布） */
const GLYPHS: Record<DocKind, { body: ReactNode; width?: number; scale?: number }> = {
  doc: { body: <path d="M6 7h12M6 12h12M6 17h7" />, width: 2.4 },
  sheet: {
    body: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 10h16M4 15h16M10 4v16" />
      </>
    ),
  },
  base: {
    body: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9.5h16M9.5 9.5V20" />
      </>
    ),
  },
  slides: {
    body: (
      <>
        <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" />
        <path d="M12 15.5V20M8.5 20h7" />
      </>
    ),
  },
  form: { body: <path d="m5 7 1.5 1.5L9 6M12.5 7.5H19M5 15l1.5 1.5L9 14M12.5 15.5H19" /> },
  mind: {
    body: (
      <>
        <circle cx="9" cy="12" r="2.5" />
        <path d="M11.5 12H19M10.8 10.2 15 6h4M10.8 13.8 15 18h4" />
      </>
    ),
  },
  flow: {
    body: (
      <>
        <rect x="4" y="4" width="7" height="6" rx="1.2" />
        <rect x="13" y="14" width="7" height="6" rx="1.2" />
        <path d="M7.5 10v4a3 3 0 0 0 3 3H13" />
      </>
    ),
  },
  wiki: {
    body: <path d="M5 18.5V5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5zm0 0A1.5 1.5 0 0 0 6.5 20H19" />,
  },
  folder: { body: <path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /> },
  file: {
    body: (
      <>
        <path d="M13.5 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5z" />
        <path d="M13.5 3.5v5h5" />
      </>
    ),
  },
  media: { body: <path d="M8 5.5v13l10-6.5z" /> },
  disk: { body: <path d="M7.5 18h9a3.5 3.5 0 0 0 .5-6.97A5 5 0 0 0 7.2 10.1 4 4 0 0 0 7.5 18z" />, scale: 1.08 },
  design: {
    body: (
      <>
        <path d="M4 20l4-1 10-10-3-3L5 16l-1 4z" />
        <path d="M13 7l3 3" />
      </>
    ),
  },
  code: { body: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" /> },
  web: {
    body: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" />
      </>
    ),
  },
};

function radiusFor(size: number): number {
  if (size <= 24) return 5;
  if (size <= 30) return size >= 30 ? 7 : 6;
  if (size <= 38) return 8;
  return 10;
}

/** 按文档类型着色的方形图标，例如表格是绿色、网盘是天蓝色 */
export function DocIcon({
  url,
  kind,
  size = 28,
  className,
}: {
  url?: string;
  kind?: DocKind;
  size?: number;
  className?: string;
}) {
  const k = kind ?? docKind(url ?? "");
  const glyph = GLYPHS[k];
  const g = Math.round(size * 0.54 * (glyph.scale ?? 1));
  const tile = (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size, borderRadius: radiusFor(size), background: DOC_KINDS[k].color }}
    >
      <svg
        width={g}
        height={g}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={glyph.width ?? 2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph.body}
      </svg>
    </span>
  );
  // 不认识的普通网站：显示网站自己的图标，取不到时用地球图标
  if (k === "web" && url) {
    return <Favicon url={url} size={size} radius={radiusFor(size)} fallback={tile} className={className} />;
  }
  return tile;
}

/** 项目徽标：彩色方块 + 项目名第一个字 */
export function ProjectBadge({
  project,
  size = 18,
  className,
}: {
  project: { id: number; name: string };
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center font-semibold text-white select-none", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size <= 24 ? 4 : size <= 40 ? 8 : 10,
        background: projectColor(project.id),
        fontSize: Math.round(size * (size <= 24 ? 0.6 : 0.46)),
        lineHeight: 1,
      }}
    >
      {initialOf(project.name)}
    </span>
  );
}

/** 表格里「所在项目」前面的小色块；收件箱为灰色 */
export function ProjectDot({ id, className }: { id: number | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-2 shrink-0 rounded-[2px]", className)}
      style={{ background: projectColor(id) }}
    />
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <rect x="11" y="7" width="13" height="16" rx="2.5" fill="#FFFFFF" opacity="0.45" />
      <path
        d="M8 11.5A2.5 2.5 0 0 1 10.5 9h7.2l3.3 3.3v9.2a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 8 21.5z"
        fill="#FFFFFF"
      />
      <path d="M11 16.5h7M11 19.5h4.5" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Avatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.41) }}
    >
      我
    </span>
  );
}

export type IllustrationKind = "links" | "search" | "trash" | "done";

/** 空状态插画：叠放的卡片 + 右下角的圆形标记 */
export function Illustration({ kind = "links" }: { kind?: IllustrationKind }) {
  const badge =
    kind === "search" ? (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-4-4" />
      </svg>
    ) : kind === "trash" ? (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9.5 7V4.5h5V7" />
      </svg>
    ) : kind === "done" ? (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    ) : (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  const badgeColor = kind === "done" ? "var(--success)" : kind === "trash" ? "var(--icon)" : "var(--accent)";
  return (
    <div aria-hidden className="relative h-[116px] w-[168px]">
      <span className="absolute top-[26px] left-[14px] h-[74px] w-[100px] -rotate-[8deg] rounded-[10px] bg-field" />
      <span className="absolute top-[10px] left-[42px] flex h-20 w-[104px] flex-col gap-2 rounded-[10px] border border-line-strong bg-surface p-3.5 shadow-[0_6px_16px_var(--shadow)]">
        <span className="block h-2 w-3/5 rounded bg-disabled" />
        <span className="block h-1.5 w-[86%] rounded-[3px] bg-chip" />
        <span className="block h-1.5 w-[72%] rounded-[3px] bg-chip" />
      </span>
      <span
        className="absolute right-1.5 bottom-1.5 flex size-[38px] items-center justify-center rounded-full shadow-[0_4px_12px_var(--shadow)]"
        style={{ background: badgeColor }}
      >
        {badge}
      </span>
    </div>
  );
}
