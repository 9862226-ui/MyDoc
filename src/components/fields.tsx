"use client";

import { ChevronDown, X } from "lucide-react";
import { useRef, useState } from "react";
import type { AppData } from "@/lib/types";
import { projectIndex, projectPathLabel } from "@/lib/view";
import { cx, Menu, ProjectBadge, ProjectDot, Select, type MenuItem } from "./ui";

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

/** 选择项目的下拉按钮：带项目颜色，按分组列出 */
export function ProjectPicker({
  data,
  value,
  onChange,
  id,
  className,
}: {
  data: AppData;
  value: number | null;
  onChange: (v: number | null) => void;
  id?: string;
  className?: string;
}) {
  const info = value === null ? undefined : projectIndex(data).get(value);
  const items: MenuItem[] = [
    {
      label: "收件箱（暂不归类）",
      icon: <ProjectDot id={null} className="size-4 rounded" />,
      checked: value === null,
      onSelect: () => onChange(null),
    },
    ...data.groups.flatMap((g): MenuItem[] => {
      const projects = data.projects.filter((p) => p.groupId === g.id && (!p.archived || p.id === value));
      if (!projects.length) return [];
      return [
        { divider: true },
        { heading: g.name },
        ...projects.map((p) => ({
          label: p.archived ? `${p.name}（已归档）` : p.name,
          icon: <ProjectBadge project={p} size={16} />,
          checked: p.id === value,
          onSelect: () => onChange(p.id),
        })),
      ];
    }),
  ];
  return (
    <Menu
      label="选择项目"
      align="start"
      matchWidth
      items={items}
      menuClassName="min-w-56"
      trigger={(props) => (
        <button
          type="button"
          id={id}
          {...props}
          className={cx(
            "flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-control bg-surface px-2.5 text-left transition-[border-color,box-shadow] hover:border-accent/60 aria-expanded:border-accent aria-expanded:ring-2 aria-expanded:ring-accent/15",
            className,
          )}
        >
          {info ? (
            <ProjectBadge project={info.project} size={16} />
          ) : (
            <ProjectDot id={null} className="size-4 rounded" />
          )}
          <span className="min-w-0 flex-1 truncate">{info ? projectPathLabel(info) : "收件箱（暂不归类）"}</span>
          <ChevronDown size={14} className="shrink-0 text-icon" />
        </button>
      )}
    />
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
          "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border border-control bg-surface px-2 py-1 transition-[border-color,box-shadow] hover:border-accent/60",
          focused && "border-accent ring-2 ring-accent/15 hover:border-accent",
        )}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex h-6 items-center gap-0.5 rounded bg-field pr-0.5 pl-2 text-[13px]">
            {tag}
            <button
              type="button"
              aria-label={`移除标签 ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((t) => t !== tag));
              }}
              className="flex size-5 cursor-pointer items-center justify-center rounded text-icon hover:bg-chip hover:text-fg"
            >
              <X size={12} strokeWidth={2.4} />
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
          className="h-[26px] min-w-28 flex-1 bg-transparent px-0.5 outline-none placeholder:text-icon"
        />
      </div>
      {showList && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line-strong bg-menu p-1 shadow-pop">
          {matches.map((m, i) => (
            <button
              key={m}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(m)}
              className={cx(
                "flex h-9 w-full cursor-pointer items-center rounded-md px-2.5 text-left hover:bg-hover",
                i === active && "bg-hover",
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
