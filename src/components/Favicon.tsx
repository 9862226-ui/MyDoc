"use client";

import { useState, type ReactNode } from "react";
import { hostOf } from "@/lib/platforms";
import { cx } from "./cx";

/** 普通网站显示它自己的图标；没有图标时显示 fallback */
export function Favicon({
  url,
  size,
  radius,
  fallback,
  className,
}: {
  url: string;
  size: number;
  radius: number;
  fallback: ReactNode;
  className?: string;
}) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(false);
  if (!host || failed) return <>{fallback}</>;
  const img = Math.round(size * 0.62);
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center border border-line bg-surface", className)}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <img
        src={`/api/favicon?host=${encodeURIComponent(host)}`}
        alt=""
        width={img}
        height={img}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        onLoad={(e) => e.currentTarget.naturalWidth === 0 && setFailed(true)}
        style={{ width: img, height: img, objectFit: "contain" }}
      />
    </span>
  );
}
