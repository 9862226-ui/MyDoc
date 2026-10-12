"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";
import type { AppData } from "@/lib/types";
import { cx, Select } from "./ui";

/** <option> 列表：收件箱 + 按分组排列的项目 */
export function ProjectOptions({ data, current }: { data: AppData; current?: number | null }) {
  return (
    <>
      <option value="inbox">收件箱（暂不归类）</option>
      {data.groups.map((g) => {
        const projects = data.projects.filter((p) => p.groupId === g.id && (!p.archived || p.id === current));
        if (!projects.length) return null;
        return (
          <optgroup key={g.id} label={g.name}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? "（已归档）" : ""}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

export const parseProjectValue = (v: string): number | null => (v === "inbox" ? null : Number(v));

export function ProjectSelect({
  data,
  value,
  onChange,
  className,
}: {
  data: AppData;
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
}) {
  return (
    <Select
      className={className}
      value={value === null ? "inbox" : String(value)}
      onChange={(e) => onChange(parseProjectValue(e.target.value))}
    >
      <ProjectOptions data={data} current={value} />
    </Select>
  );
}

/** 标签输入：回车或逗号添加，退格删除，带已有标签的提示 */
export function TagInput({
  value,
  onChange,
  suggestions,
  placeholder = "输入后回车添加",
  autoFocus,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const taken = new Set(value.map((v) => v.toLowerCase()));
  const q = text.trim().replace(/^#/, "").toLowerCase();
  const matches = suggestions.filter((s) => !taken.has(s.toLowerCase()) && s.toLowerCase().includes(q)).slice(0, 8);
  const showList = focused && matches.length > 0;

  const add = (raw: string) => {
    const tag = raw.replace(/^#+/, "").trim();
    if (tag && !taken.has(tag.toLowerCase())) onChange([...value, tag]);
    setText("");
    setActive(-1);
  };

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={cx(
          "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-1 transition",
          focused && "border-accent ring-2 ring-accent/20",
        )}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex h-6 items-center gap-0.5 rounded-md bg-accent-soft pr-0.5 pl-2 text-xs text-accent">
            {tag}
            <button
              type="button"
              aria-label={`移除标签 ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((t) => t !== tag));
              }}
              className="rounded p-0.5 hover:bg-accent/15"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          data-autofocus={autoFocus ? "" : undefined}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,，]$/.test(v)) add(v.slice(0, -1));
            else {
              setText(v);
              setActive(-1);
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (text.trim()) add(text);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              if (!text.trim() && active < 0) return;
              e.preventDefault();
              const exact = matches.find((m) => m.toLowerCase() === q);
              add(active >= 0 ? matches[active] : (exact ?? text));
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === "ArrowDown" && showList) {
              e.preventDefault();
              setActive((a) => (a + 1) % matches.length);
            } else if (e.key === "ArrowUp" && showList) {
              e.preventDefault();
              setActive((a) => (a <= 0 ? matches.length - 1 : a - 1));
            } else if (e.key === "Escape" && showList) {
              e.preventDefault();
              e.stopPropagation();
              inputRef.current?.blur();
            }
          }}
          className="h-7 min-w-24 flex-1 bg-transparent px-1.5 outline-none placeholder:text-muted/70"
        />
      </div>
      {showList && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg">
          {matches.map((m, i) => (
            <button
              key={m}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(m)}
              className={cx(
                "flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] hover:bg-surface-2",
                i === active && "bg-surface-2",
              )}
            >
              # {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
