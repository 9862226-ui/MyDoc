"use client";

import { ChevronDown, Copy, ExternalLink, Pencil, Pin, PinOff, Plus, Quote, Trash2 } from "lucide-react";
import NextLink from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { api, copyText, refreshData, useAppData } from "@/lib/client";
import { shortTime } from "@/lib/format";
import { toggleTask } from "@/lib/md-edit";
import type { AppData, Snippet } from "@/lib/types";
import { projectIndex, projectPathLabel, snippetMatches } from "@/lib/view";
import { ProjectPicker, TagInput } from "./fields";
import {
  Button,
  cx,
  Dialog,
  DialogFooter,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  ProjectBadge,
  SearchField,
  Skeleton,
  Tag,
} from "./ui";
import { Markdown } from "./Markdown";
import { clearDraft, MarkdownEditor } from "./MarkdownEditor";
import { useUI, type UI } from "./ui-context";

export interface SnippetInit {
  content?: string;
  projectId?: number | null;
  sourceUrl?: string;
  sourceTitle?: string;
}

/* ---------- 添加 / 编辑 ---------- */

export function SnippetDialog({
  open,
  onClose,
  snippet,
  init,
  onSaved,
  switchTo,
}: {
  open: boolean;
  onClose: () => void;
  snippet?: Snippet;
  init?: SnippetInit;
  onSaved?: () => void;
  /** 弹窗顶部的切换按钮，例如「改为收藏链接」 */
  switchTo?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={snippet ? "编辑摘录" : "添加摘录"}
      description={snippet ? undefined : "记下一段文字：会议结论、账号说明、文章里的一段话……"}
      bodyClassName="pb-0"
    >
      <SnippetForm snippet={snippet} init={init} onDone={onClose} onSaved={onSaved} switchTo={switchTo} />
    </Dialog>
  );
}

function SnippetForm({
  snippet,
  init,
  onDone,
  onSaved,
  switchTo,
}: {
  snippet?: Snippet;
  init?: SnippetInit;
  onDone: () => void;
  onSaved?: () => void;
  switchTo?: ReactNode;
}) {
  const ui = useUI();
  const { data } = useAppData();
  const [content, setContent] = useState(snippet?.content ?? init?.content ?? "");
  const [projectId, setProjectId] = useState<number | null>(
    snippet ? snippet.projectId : (init?.projectId ?? ui.defaultProjectId),
  );
  const [tags, setTags] = useState<string[]>(snippet?.tags ?? []);
  const [sourceUrl, setSourceUrl] = useState(snippet?.sourceUrl ?? init?.sourceUrl ?? "");
  const [sourceTitle, setSourceTitle] = useState(snippet?.sourceTitle ?? init?.sourceTitle ?? "");
  const [showSource, setShowSource] = useState(!!(sourceUrl || sourceTitle));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 没保存的内容存成草稿：新建的共用一份，编辑的按摘录分开
  const draftName = snippet ? `snippet-${snippet.id}` : "snippet-new";

  if (!data) return null;

  const save = async () => {
    if (!content.trim()) return setError("内容不能为空");
    setBusy(true);
    setError("");
    const body = { content, projectId, tags, sourceUrl, sourceTitle };
    try {
      if (snippet) await api(`/api/snippets/${snippet.id}`, { method: "PATCH", body });
      else await api("/api/snippets", { body });
      await refreshData();
      clearDraft(draftName);
      ui.toast(snippet ? "已保存" : "已添加摘录");
      onSaved?.();
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {switchTo}
      <Field label="内容" error={error} as="div">
        <MarkdownEditor
          aria-label="内容"
          autoFocus
          value={content}
          onChange={setContent}
          onSubmit={() => void save()}
          draft={draftName}
          rows={7}
          invalid={!!error}
          placeholder="粘贴或输入一段文字，支持 Markdown：- [ ] 待办、**加粗**、#标签"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field as="div" label="项目">
          <ProjectPicker data={data} value={projectId} onChange={setProjectId} noneLabel="不放进项目" />
        </Field>
        <Field as="div" label="标签">
          <TagInput value={tags} onChange={setTags} suggestions={data.tags.map((t) => t.name)} />
        </Field>
      </div>
      {showSource ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="来源链接">
            <Input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              inputMode="url"
              placeholder="https://"
            />
          </Field>
          <Field label="来源标题">
            <Input
              value={sourceTitle}
              onChange={(e) => setSourceTitle(e.target.value)}
              maxLength={200}
              placeholder="例如文章或文档的名称"
            />
          </Field>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowSource(true)}
          className="flex cursor-pointer items-center gap-1 self-start text-[13px] text-accent-text hover:underline"
        >
          <Plus size={14} />
          记下来源（可选）
        </button>
      )}
      <DialogFooter>
        <span className="mr-auto hidden text-xs text-faint sm:inline">Ctrl + 回车 保存</span>
        <Button onClick={onDone}>取消</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {snippet ? "保存" : "添加"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** 收藏页顶部：同一份内容可以存成链接，也可以存成摘录 */
export function SaveAsSwitch({
  mode,
  onChange,
}: {
  mode: "link" | "snippet";
  onChange: (m: "link" | "snippet") => void;
}) {
  return (
    <div role="radiogroup" aria-label="保存为" className="flex self-start rounded-md bg-field p-0.5">
      {(
        [
          ["link", "收藏链接"],
          ["snippet", "保存为摘录"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => onChange(value)}
          className={cx(
            "h-7 cursor-pointer rounded px-3 text-[13px] transition-colors",
            mode === value
              ? "bg-surface font-medium shadow-[0_1px_2px_var(--shadow)] dark:bg-chip"
              : "text-muted hover:text-fg",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ---------- 卡片 ---------- */

/** 复制、置顶、删除（可撤销） */
export function useSnippetActions() {
  const ui = useUI();
  const run = async (fn: () => Promise<unknown>, message?: string, opts?: Parameters<UI["toast"]>[1]) => {
    try {
      await fn();
      await refreshData();
      if (message) ui.toast(message, opts);
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };
  return {
    copy: async (s: Snippet) => {
      const ok = await copyText(s.content);
      ui.toast(ok ? "已复制" : "复制失败", { kind: ok ? "ok" : "error" });
    },
    /** 在卡片上直接给待办打勾 */
    toggleTask: (s: Snippet, n: number) =>
      run(() => api(`/api/snippets/${s.id}`, { method: "PATCH", body: { content: toggleTask(s.content, n) } })),
    togglePin: (s: Snippet) =>
      run(() => api(`/api/snippets/${s.id}`, { method: "PATCH", body: { pinned: !s.pinned } })),
    remove: (s: Snippet) =>
      run(() => api(`/api/snippets/${s.id}`, { method: "DELETE" }), "已删除摘录", {
        action: {
          label: "撤销",
          onClick: () =>
            void run(() =>
              api("/api/snippets", {
                body: {
                  content: s.content,
                  projectId: s.projectId,
                  tags: s.tags,
                  sourceUrl: s.sourceUrl,
                  sourceTitle: s.sourceTitle,
                  pinned: s.pinned,
                },
              }),
            ),
        },
      }),
  };
}

const COLLAPSE_AT = 240;

export function SnippetCard({
  snippet: s,
  data,
  showProject = true,
}: {
  snippet: Snippet;
  data: AppData;
  showProject?: boolean;
}) {
  const ui = useUI();
  const actions = useSnippetActions();
  const [expanded, setExpanded] = useState(false);
  const long = s.content.length > COLLAPSE_AT || s.content.split("\n").length > 8;
  const info = s.projectId === null ? undefined : projectIndex(data).get(s.projectId);

  return (
    <article className="group/snippet flex break-inside-avoid flex-col gap-2.5 rounded-lg border border-line bg-surface p-4 transition-shadow hover:shadow-card">
      <div className={cx("relative", long && !expanded && "max-h-48 overflow-hidden")}>
        <Markdown text={s.content} onToggleTask={(n) => void actions.toggleTask(s, n)} />
        {long && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent" />
        )}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex cursor-pointer items-center gap-0.5 self-start text-[13px] text-accent-text hover:underline"
        >
          {expanded ? "收起" : "展开全文"}
          <ChevronDown size={14} className={cx("transition-transform", expanded && "rotate-180")} />
        </button>
      )}
      {(s.sourceUrl || s.sourceTitle) && (
        <div className="flex min-w-0 items-center gap-1 text-[13px] text-muted">
          <span className="shrink-0">来源：</span>
          {s.sourceUrl ? (
            <a
              href={s.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1 hover:text-accent-text"
            >
              <span className="truncate">{s.sourceTitle || s.sourceUrl}</span>
              <ExternalLink size={12} className="shrink-0" />
            </a>
          ) : (
            <span className="truncate">{s.sourceTitle}</span>
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line-soft pt-2.5 text-xs text-faint">
        {s.pinned && (
          <Tag tone="pin" className="gap-0.5">
            <Pin size={10} />
            置顶
          </Tag>
        )}
        {showProject && info && (
          <NextLink
            href={`/p/${info.project.id}`}
            className="inline-flex min-w-0 items-center gap-1 text-muted hover:text-accent-text"
          >
            <ProjectBadge project={info.project} size={14} />
            <span className="truncate">{projectPathLabel(info)}</span>
          </NextLink>
        )}
        {s.tags.map((t) => (
          <Tag key={t} tone="chip">
            #{t}
          </Tag>
        ))}
        <span className="ml-auto shrink-0">{shortTime(s.createdAt)}</span>
        <span className="flex shrink-0 items-center gap-0.5">
          <IconButton label="复制" size="sm" onClick={() => void actions.copy(s)}>
            <Copy size={14} />
          </IconButton>
          <Menu
            items={[
              { label: "编辑", icon: <Pencil size={15} />, onSelect: () => ui.editSnippet(s) },
              s.pinned
                ? { label: "取消置顶", icon: <PinOff size={15} />, onSelect: () => void actions.togglePin(s) }
                : { label: "置顶", icon: <Pin size={15} />, onSelect: () => void actions.togglePin(s) },
              { divider: true },
              { label: "删除", icon: <Trash2 size={15} />, danger: true, onSelect: () => void actions.remove(s) },
            ]}
          />
        </span>
      </div>
    </article>
  );
}

/* ---------- 摘录页 ---------- */

export function SnippetsView() {
  const { data } = useAppData();
  const ui = useUI();
  const [q, setQ] = useState("");
  const shown = useMemo(() => (data ? data.snippets.filter((s) => snippetMatches(s, data, q)) : []), [data, q]);

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pt-4 pb-12 md:px-8 md:pt-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-[#7B61FF] text-white md:size-12"
        >
          <Quote size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="hidden text-xl leading-7 font-semibold md:block">摘录</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            收集的文字片段{data?.snippets.length ? ` · ${data.snippets.length} 条` : ""}，点卡片右下角可以一键复制
          </p>
        </div>
        <Button variant="primary" className="hidden md:inline-flex" onClick={() => ui.editSnippet()}>
          <Plus size={16} />
          添加摘录
        </Button>
      </div>

      {!data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : data.snippets.length === 0 ? (
        <EmptyState
          illustration={null}
          icon={<Quote size={40} strokeWidth={1.5} />}
          title="还没有摘录"
          actions={
            <Button variant="primary" onClick={() => ui.editSnippet()}>
              <Plus size={16} />
              添加摘录
            </Button>
          }
          tip="手机上把一段文字「分享」给 MyDoc，或者在网页上选中文字后点收藏按钮，也能存成摘录"
        >
          会议结论、账号说明、文章里的一段话……不是链接的内容也可以收进来，按项目归类，随时搜索和复制
        </EmptyState>
      ) : (
        <>
          <SearchField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="在摘录中搜索（支持拼音）"
            className="w-full md:w-80"
          />
          {shown.length === 0 ? (
            <p className="py-12 text-center text-faint">没有找到相关的摘录</p>
          ) : (
            <div className="columns-1 gap-4 md:columns-2 xl:columns-3 [&>article]:mb-4">
              {shown.map((s) => (
                <SnippetCard key={s.id} snippet={s} data={data} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 项目页底部：这个项目的摘录 */
export function ProjectSnippets({ projectId }: { projectId: number }) {
  const { data } = useAppData();
  const ui = useUI();
  if (!data) return null;
  const list = data.snippets.filter((s) => s.projectId === projectId);
  if (!list.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Quote size={16} className="text-[#7B61FF]" />
          摘录
          <span className="text-[13px] font-normal text-faint">{list.length}</span>
        </h2>
        <Button size="sm" onClick={() => ui.editSnippet()}>
          <Plus size={14} />
          添加摘录
        </Button>
      </div>
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3 [&>article]:mb-4">
        {list.map((s) => (
          <SnippetCard key={s.id} snippet={s} data={data} showProject={false} />
        ))}
      </div>
    </section>
  );
}
