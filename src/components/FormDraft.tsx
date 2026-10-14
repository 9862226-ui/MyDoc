"use client";

import { History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readLocal, writeLocal } from "@/lib/client";
import { cx } from "./ui";

const PREFIX = "mydoc.form.";
/** 太旧的草稿不再提示 */
const MAX_AGE = 30 * 86400_000;

interface Stored<T> {
  v: T;
  at: number;
}

export function clearFormDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // 浏览器禁用了存储
  }
}

/**
 * 表单草稿：一边输入一边存到这台设备的浏览器里，网络断了、保存失败、页面被关掉、登录过期都不会丢；
 * 保存成功后调用 clear() 清掉。打开表单时如果有和现在不一样的草稿，pending 里是它，让用户选恢复还是丢弃。
 * key 为 null 时不存（例如弹窗没打开）；isEmpty 的内容（只有模板、什么都没写）不存
 */
export function useFormDraft<T>(key: string | null, value: T, apply: (v: T) => void, isEmpty?: (v: T) => boolean) {
  const [pending, setPending] = useState<Stored<T> | null>(null);
  const base = useRef<string | null>(null);
  const dirty = useRef(false);

  // 打开时：记下初始内容，看看有没有上次没保存的
  useEffect(() => {
    dirty.current = false;
    if (!key) {
      base.current = null;
      setPending(null);
      return;
    }
    base.current = JSON.stringify(value);
    const d = readLocal<Stored<T> | null>(PREFIX + key, null);
    const usable = d && d.v !== undefined && Date.now() - d.at < MAX_AGE;
    if (usable && JSON.stringify(d.v) !== base.current && !isEmpty?.(d.v)) setPending(d);
    else {
      setPending(null);
      if (d) clearFormDraft(key);
    }
    // 只在打开（key 变化）时检查
  }, [key]);

  // 内容变了就存；改回原样或者清空了就删掉
  useEffect(() => {
    if (!key || base.current === null) return;
    const s = JSON.stringify(value);
    if (!dirty.current && s === base.current) return;
    dirty.current = true;
    if (s === base.current || isEmpty?.(value)) clearFormDraft(key);
    else writeLocal(PREFIX + key, { v: value, at: Date.now() });
  }, [key, value]);

  return {
    pending,
    restore: () => {
      if (!pending) return;
      apply(pending.v);
      setPending(null);
    },
    discard: () => {
      if (key && !dirty.current) clearFormDraft(key);
      setPending(null);
    },
    /** 保存成功后调用 */
    clear: () => {
      if (key) clearFormDraft(key);
      base.current = JSON.stringify(value);
      dirty.current = false;
      setPending(null);
    },
  };
}

/** 2 分钟前、今天 14:20、10月12日 09:05 */
function savedLabel(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const d = new Date(at);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString() ? `今天 ${hm}` : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

/** 「有上次没保存的内容」提示条 */
export function DraftBanner({
  draft,
  className,
}: {
  draft: { pending: { at: number } | null; restore: () => void; discard: () => void };
  className?: string;
}) {
  if (!draft.pending) return null;
  return (
    <div
      role="status"
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn-text",
        className,
      )}
    >
      <History size={15} className="shrink-0" />
      <span className="min-w-0 flex-1">
        上次没保存的内容暂存在这台设备上<span className="text-warn-text/70">（{savedLabel(draft.pending.at)}）</span>
      </span>
      <span className="flex shrink-0 gap-3">
        <button type="button" className="cursor-pointer font-medium hover:underline" onClick={draft.restore}>
          恢复
        </button>
        <button type="button" className="cursor-pointer hover:underline" onClick={draft.discard}>
          丢弃
        </button>
      </span>
    </div>
  );
}
