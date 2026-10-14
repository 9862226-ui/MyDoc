"use client";

import {
  Bold,
  Code,
  Heading2,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Strikethrough,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { readLocal, writeLocal } from "@/lib/client";
import { codeOp, enterOp, indentOp, linePrefixOp, linkOp, wrapOp, type EditOp, type LineKind } from "@/lib/md-edit";
import { Markdown } from "./Markdown";
import { cx } from "./ui";

const draftKey = (key: string) => `mydoc.draft.${key}`;

/** 保存成功后清掉草稿 */
export function clearDraft(key: string) {
  try {
    localStorage.removeItem(draftKey(key));
  } catch {
    // 浏览器禁用了存储
  }
}

type Tool = { label: string; keys?: string; icon: LucideIcon; op: (t: string, s: number, e: number) => EditOp };

const TOOLS: (Tool | "|")[] = [
  { label: "标题", icon: Heading2, op: (t, s, e) => linePrefixOp(t, s, e, "h2") },
  { label: "加粗", keys: "Ctrl+B", icon: Bold, op: (t, s, e) => wrapOp(t, s, e, "**", "**", "加粗") },
  { label: "删除线", icon: Strikethrough, op: (t, s, e) => wrapOp(t, s, e, "~~", "~~", "删除") },
  "|",
  { label: "无序列表", icon: List, op: (t, s, e) => linePrefixOp(t, s, e, "ul") },
  { label: "编号列表", icon: ListOrdered, op: (t, s, e) => linePrefixOp(t, s, e, "ol") },
  { label: "待办", icon: ListChecks, op: (t, s, e) => linePrefixOp(t, s, e, "task") },
  "|",
  { label: "引用", icon: Quote, op: (t, s, e) => linePrefixOp(t, s, e, "quote") },
  { label: "代码", icon: Code, op: codeOp },
  { label: "链接", icon: Link2, op: linkOp },
];

/**
 * Markdown 编辑框：工具栏、快捷键（Ctrl+B 加粗、Ctrl+Enter 保存、Tab 缩进）、回车自动接着写列表、
 * 编辑 / 预览切换、草稿自动保存。
 * markdown=false 时不显示工具栏和预览，只保留回车续编号（用于要原样粘贴的日报总结）
 */
export function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  draft,
  markdown = true,
  rows = 6,
  placeholder,
  autoFocus,
  id,
  className,
  invalid,
  onBlur,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  /** 草稿的名字；传了就自动保存没提交的内容 */
  draft?: string;
  markdown?: boolean;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  className?: string;
  invalid?: boolean;
  onBlur?: () => void;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // 打开时如果有上次没保存的草稿，提示恢复
  useEffect(() => {
    if (!draft) return;
    const d = readLocal<string>(draftKey(draft), "");
    if (d && d !== value) setSaved(d);
    // 只在打开时检查一次
  }, [draft]);

  const change = (v: string) => {
    onChange(v);
    if (draft) {
      if (v.trim()) writeLocal(draftKey(draft), v);
      else clearDraft(draft);
    }
  };

  /** 执行一个编辑操作；用 insertText 可以保留浏览器的撤销记录 */
  const apply = (op: EditOp | null) => {
    const el = ref.current;
    if (!el || !op) return false;
    el.focus();
    el.setSelectionRange(op.start, op.end);
    const ok = op.insert !== "" && document.execCommand("insertText", false, op.insert);
    if (!ok) {
      el.setRangeText(op.insert, op.start, op.end, "end");
      change(el.value);
    }
    el.setSelectionRange(op.selStart, op.selEnd);
    return true;
  };

  const tool = (t: Tool) => {
    const el = ref.current;
    if (!el) return;
    setPreview(false);
    apply(t.op(el.value, el.selectionStart, el.selectionEnd));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Enter" && mod) {
      if (onSubmit) {
        e.preventDefault();
        onSubmit();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && el.selectionStart === el.selectionEnd) {
      if (apply(enterOp(el.value, el.selectionStart))) e.preventDefault();
      return;
    }
    if (e.key === "Tab" && markdown) {
      if (apply(indentOp(el.value, el.selectionStart, el.selectionEnd, e.shiftKey))) e.preventDefault();
      return;
    }
    if (markdown && mod && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        apply(wrapOp(el.value, el.selectionStart, el.selectionEnd, "**", "**", "加粗"));
      } else if (k === "i") {
        e.preventDefault();
        apply(wrapOp(el.value, el.selectionStart, el.selectionEnd, "*", "*", "斜体"));
      }
    }
  };

  return (
    <div
      className={cx(
        "flex flex-col overflow-hidden rounded-md border bg-surface transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
        invalid ? "border-danger" : "border-control hover:border-accent/60",
        className,
      )}
    >
      {saved !== null && (
        <div className="flex items-center gap-2 border-b border-line bg-warn-soft px-3 py-1.5 text-xs text-warn-text">
          <span className="min-w-0 flex-1 truncate">有上次没保存的内容</span>
          <button
            type="button"
            className="cursor-pointer font-medium hover:underline"
            onClick={() => {
              change(saved);
              setSaved(null);
              requestAnimationFrame(() => ref.current?.focus());
            }}
          >
            恢复
          </button>
          <button
            type="button"
            className="cursor-pointer hover:underline"
            onClick={() => {
              if (draft) clearDraft(draft);
              setSaved(null);
            }}
          >
            丢弃
          </button>
        </div>
      )}
      {markdown && (
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-line px-1.5 py-1">
          {TOOLS.map((t, i) =>
            t === "|" ? (
              <span key={i} aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line-strong" />
            ) : (
              <button
                key={t.label}
                type="button"
                title={t.keys ? `${t.label}（${t.keys}）` : t.label}
                aria-label={t.label}
                // 按下时不让文本框失去焦点，保住选中的文字
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => tool(t)}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"
              >
                <t.icon size={15} />
              </button>
            ),
          )}
          <div role="tablist" aria-label="编辑或预览" className="ml-auto flex shrink-0 rounded bg-field p-0.5 text-xs">
            {(["编辑", "预览"] as const).map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={preview === (i === 1)}
                onClick={() => setPreview(i === 1)}
                className={cx(
                  "h-6 cursor-pointer rounded px-2 transition-colors",
                  preview === (i === 1)
                    ? "bg-surface text-fg shadow-[0_1px_2px_var(--shadow)] dark:bg-chip"
                    : "text-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {preview ? (
        <div className="overflow-y-auto px-2.5 py-2" style={{ minHeight: `${rows * 1.5 + 1}rem` }}>
          {value.trim() ? <Markdown text={value} /> : <p className="text-faint">没有内容</p>}
        </div>
      ) : (
        <textarea
          ref={ref}
          id={id}
          aria-label={ariaLabel}
          aria-invalid={invalid}
          autoFocus={autoFocus}
          data-autofocus={autoFocus ? true : undefined}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className="w-full resize-y bg-transparent px-2.5 py-2 leading-6 text-fg outline-none placeholder:text-icon"
        />
      )}
      {markdown && !preview && (
        <div className="flex items-center gap-3 px-2.5 pb-1.5 text-[11px] text-faint max-sm:hidden">
          <span>支持 Markdown</span>
          <span>回车自动接着写列表</span>
          <span>Tab 缩进</span>
        </div>
      )}
    </div>
  );
}
