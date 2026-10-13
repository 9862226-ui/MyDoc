"use client";

import { ArrowRight, Sparkles, X } from "lucide-react";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import type { AiConfig, Suggestion } from "@/lib/ai";
import { api, refreshData, useAppData } from "@/lib/client";
import { platformLabel } from "@/lib/platforms";
import type { AppData } from "@/lib/types";
import { ProjectSelect } from "./fields";
import { Banner, Button, Checkbox, cx, Dialog, DialogFooter, DocIcon, Spinner, Tag } from "./ui";
import { useUI, type UI } from "./ui-context";

export const AI_KEY = "/api/settings/ai";

export function useAiSettings() {
  return useSWR(AI_KEY, (url: string) => api<{ config: AiConfig; ready: boolean }>(url));
}

interface ApplyItem {
  id: number;
  projectId: number | null;
  tags: string[];
}

const mergeTags = (a: string[], b: string[]) => {
  const seen = new Set(a.map((t) => t.toLowerCase()));
  return [...a, ...b.filter((t) => !seen.has(t.toLowerCase()))];
};

/** 应用归类结果，返回撤销用的原值 */
async function applyItems(data: AppData, items: ApplyItem[]): Promise<ApplyItem[]> {
  const before = items.map((it) => {
    const l = data.links.find((x) => x.id === it.id)!;
    return { id: l.id, projectId: l.projectId, tags: l.tags };
  });
  await api("/api/ai/apply", { body: { items } });
  await refreshData();
  return before;
}

function undoAction(ui: UI, before: ApplyItem[]) {
  return {
    label: "撤销",
    onClick: () =>
      void api("/api/ai/apply", { body: { items: before } })
        .then(() => refreshData())
        .catch((e: Error) => ui.toast(e.message, { kind: "error" })),
  };
}

/** 刚添加到收件箱的链接：让 AI 归类，成功后提示并可以撤销 */
export async function autoClassify(ui: UI, data: AppData, linkId: number): Promise<void> {
  try {
    const { suggestions } = await api<{ suggestions: Suggestion[] }>("/api/ai/classify", { body: { ids: [linkId] } });
    const s = suggestions[0];
    const link = data.links.find((l) => l.id === linkId);
    if (!s || !link || (s.projectId === null && !s.tags.length)) return;
    const before = await applyItems(data, [
      { id: linkId, projectId: s.projectId ?? link.projectId, tags: mergeTags(link.tags, s.tags) },
    ]);
    const parts = [
      s.projectId !== null && `放进了「${s.project}」`,
      s.tags.length && `加了标签 ${s.tags.map((t) => `#${t}`).join(" ")}`,
    ].filter(Boolean);
    ui.toast(`AI 已归类：${parts.join("，")}`, { action: undoAction(ui, before) });
  } catch (e) {
    ui.toast(`AI 归类失败：${(e as Error).message}`, { kind: "error" });
  }
}

/* ---------- 「AI 整理」弹窗 ---------- */

export function AiOrganizeDialog({ ids, onClose }: { ids: number[] | null; onClose: () => void }) {
  return (
    <Dialog
      open={!!ids}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent-text" />
          AI 整理
        </span>
      }
      description="AI 根据标题、网址和备注给出建议，确认后才会移动。可以改项目，也可以去掉不想要的标签。"
      size="lg"
      bodyClassName="pb-0"
    >
      {ids && <OrganizeBody ids={ids} onDone={onClose} />}
    </Dialog>
  );
}

interface Row extends Suggestion {
  checked: boolean;
}

function OrganizeBody({ ids, onDone }: { ids: number[]; onDone: () => void }) {
  const ui = useUI();
  const { data } = useAppData();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ suggestions: Suggestion[] }>("/api/ai/classify", { body: { ids } })
      .then(({ suggestions }) => {
        if (cancelled) return;
        setRows(suggestions.map((s) => ({ ...s, checked: s.projectId !== null || s.tags.length > 0 })));
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (!data) return <Spinner />;

  if (error) {
    return (
      <div className="pb-6">
        <Banner
          tone="danger"
          action={
            <NextLink href="/settings#ai" onClick={onDone}>
              去设置
            </NextLink>
          }
        >
          {error}
        </Banner>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="flex flex-col items-center gap-3 py-14 text-muted">
        <Spinner size={22} />
        <p>AI 正在分析 {ids.length} 个链接……</p>
        <p className="text-[13px] text-faint">通常需要 5～30 秒</p>
      </div>
    );
  }

  const update = (id: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.checked);

  const apply = async () => {
    setApplying(true);
    try {
      const items = chosen.map((r) => {
        const link = data.links.find((l) => l.id === r.id)!;
        return { id: r.id, projectId: r.projectId ?? link.projectId, tags: mergeTags(link.tags, r.tags) };
      });
      const before = await applyItems(data, items);
      ui.toast(`已整理 ${items.length} 个链接`, { action: undoAction(ui, before) });
      onDone();
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
      setApplying(false);
    }
  };

  return (
    <>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-muted">没有需要整理的链接</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => {
            const link = data.links.find((l) => l.id === r.id);
            if (!link) return null;
            return (
              <li
                key={r.id}
                className={cx(
                  "flex flex-col gap-2 border-b border-line-soft py-3 last:border-b-0 sm:flex-row sm:items-center",
                  !r.checked && "opacity-60",
                )}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <Checkbox checked={r.checked} onChange={(e) => update(r.id, { checked: e.target.checked })} />
                  <DocIcon url={link.url} size={28} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{link.title}</span>
                    <span className="truncate text-xs text-faint">
                      {platformLabel(link.url)}
                      {r.reason && ` · ${r.reason}`}
                    </span>
                  </span>
                </label>
                <ArrowRight size={14} className="hidden shrink-0 text-icon sm:block" />
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-[26px] sm:w-[300px] sm:pl-0">
                  <ProjectSelect
                    data={data}
                    value={r.projectId}
                    onChange={(v) => update(r.id, { projectId: v, project: "", checked: true })}
                    className="w-full"
                  />
                  {r.tags.map((t) => (
                    <Tag key={t} tone="accent" className="gap-0.5 pr-0.5">
                      #{t}
                      <button
                        type="button"
                        aria-label={`去掉标签 ${t}`}
                        onClick={() => update(r.id, { tags: r.tags.filter((x) => x !== t) })}
                        className="flex size-4 cursor-pointer items-center justify-center rounded hover:bg-accent/20"
                      >
                        <X size={11} />
                      </button>
                    </Tag>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <DialogFooter>
        <span className="mr-auto text-[13px] text-faint">没把握的会留在收件箱</span>
        <Button onClick={onDone}>取消</Button>
        <Button variant="primary" loading={applying} disabled={!chosen.length} onClick={() => void apply()}>
          应用 {chosen.length} 项
        </Button>
      </DialogFooter>
    </>
  );
}
