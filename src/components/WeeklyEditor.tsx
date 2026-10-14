"use client";

import { ArrowDown, ArrowUp, ChevronRight, Copy, Merge, Plus, RotateCcw, Trash2, Ungroup } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import {
  buildWeekly,
  draftOf,
  draftOps,
  reportKey,
  weekStart,
  weeklyText,
  isoWeek,
  shiftDate,
  type Candidate,
  type PlanItem,
  type SummaryItem,
  type WeeklyDraft,
  type WorkData,
} from "@/lib/worklog";
import { Button, Checkbox, cx, Dialog, IconButton, Input, Textarea } from "./ui";
import { useUI } from "./ui-context";
import { CopyCell, ReportCard, SubmitButton, useCopy, useSubmit } from "./work-ui";

/**
 * 周报：人工整理本周总结（勾选候选、合并、调顺序、改字），编辑下周计划，
 * 上周计划逐条打勾，打勾的写进本周总结。
 */
export function WeeklyEditor({ data, date, onSaved }: { data: WorkData; date: string; onSaved: () => void }) {
  const ui = useUI();
  const copy = useCopy();
  const submit = useSubmit();
  const start = weekStart(date);
  const key = reportKey("weekly", start);
  // 本地先改，界面立刻变化；保存按顺序排队
  const [local, setLocal] = useState<WeeklyDraft | null | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  useEffect(() => setLocal(undefined), [start]);

  const view = useMemo(() => {
    if (local === undefined) return data;
    const fields = { ...data.reports[key] };
    if (local) fields.draft = local;
    else delete fields.draft;
    return { ...data, reports: { ...data.reports, [key]: fields } };
  }, [data, key, local]);
  const r = useMemo(() => buildWeekly(view, start), [view, start]);
  const textOf = (k: string) => r.candidates.find((c) => c.key === k)?.text ?? "";

  const save = (next: WeeklyDraft | null) => {
    setLocal(next);
    queue.current = queue.current
      .then(() =>
        api("/api/work/reports", { method: "PUT", body: { kind: "weekly", key: start, fields: { draft: next } } }),
      )
      .then(onSaved)
      .catch((e) => ui.toast((e as Error).message, { kind: "error" }));
  };
  const apply = (fn: (d: WeeklyDraft) => WeeklyDraft) => save(fn(draftOf(r)));

  const [selected, setSelected] = useState<string[]>([]);
  const [merging, setMerging] = useState<string | null>(null);
  useEffect(() => setSelected([]), [start]);
  const picked = r.items.filter((it) => selected.includes(it.id));

  const groups = useMemo(() => {
    const map = new Map<string, Candidate[]>();
    for (const c of r.candidates) map.set(c.projectName, [...(map.get(c.projectName) ?? []), c]);
    return [...map.entries()];
  }, [r.candidates]);

  return (
    <ReportCard
      title="员工周报"
      subtitle={r.logCount ? `${r.logCount} 条记录 · 整理好后点「复制」粘贴到公司系统` : "这一周还没有记录"}
      actions={
        <>
          <Button size="sm" onClick={() => void copy("整张周报", weeklyText(r))} disabled={!r.logCount}>
            <Copy size={14} />
            复制全文
          </Button>
          <SubmitButton
            submitted={!!r.submittedAt}
            busy={submit.busy}
            disabled={!r.logCount}
            onToggle={(on) => void submit.set("weekly", start, on, "周报")}
          />
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-field px-4 py-3 sm:grid-cols-4">
        <CopyCell label="周次" value={r.week} mono />
        <CopyCell label="周工作天数" value={r.workDays} mono />
        <CopyCell label="起始日期" value={r.start} mono />
        <CopyCell label="结束日期" value={r.end} mono />
      </div>

      {r.lastPlan.length > 0 && (
        <section aria-label="上周计划" className="rounded-lg border border-line px-4 py-3">
          <h3 className="text-[13px] font-medium">
            上周计划
            <span className="ml-2 font-normal text-faint">
              第 {isoWeek(shiftDate(start, -7))} 周写的 · 做完的打勾，会写进本周总结
            </span>
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {r.lastPlan.map((p) => {
              const done = r.doneLastPlan.includes(p.id);
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-start gap-2 leading-6">
                    <Checkbox
                      checked={done}
                      onChange={(e) => apply((d) => draftOps.doneLast(d, p, e.target.checked))}
                      className="mt-[5px]"
                    />
                    <span className={cx("min-w-0 flex-1", done && "text-muted line-through")}>{p.text}</span>
                    {done && <span className="shrink-0 text-xs leading-6 text-success">已完成</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="本周总结" className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-medium">本周总结</h3>
          <span className="text-xs text-faint">{r.curated ? "已整理" : "自动列出，勾选、合并、调顺序来整理"}</span>
          {r.curated && (
            <button
              type="button"
              onClick={async () => {
                if (
                  await ui.confirm({
                    title: "恢复自动生成？",
                    message: "整理过的总结和下周计划都会清空，重新按记录生成。",
                    confirmText: "恢复",
                  })
                )
                  save(null);
              }}
              className="flex cursor-pointer items-center gap-1 text-xs text-muted hover:text-fg"
            >
              <RotateCcw size={12} />
              恢复自动生成
            </button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void copy("本周总结", r.summaryText)}>
            <Copy size={14} />
            复制
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="flex min-w-0 flex-col rounded-lg border border-line">
            <div className="border-b border-line px-3 py-2 text-xs text-faint">
              候选 · {r.candidates.length} 条（同样的内容只列一次）
            </div>
            {r.candidates.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-faint">这一周还没有记录</p>
            ) : (
              <div className="flex flex-col gap-2 p-2">
                {groups.map(([name, list]) => (
                  <div key={name}>
                    <div className="truncate px-1 pb-1 text-xs font-medium text-muted">{name}</div>
                    <ul>
                      {list.map((c) => {
                        const state = r.candidateState[c.key];
                        return (
                          <li key={c.key}>
                            <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 leading-5 hover:bg-hover">
                              <Checkbox
                                checked={state === "checked"}
                                onChange={(e) => apply((d) => draftOps.toggle(d, c, e.target.checked))}
                                className="mt-[3px]"
                              />
                              <span className={cx("min-w-0 flex-1 text-[13px]", state !== "checked" && "text-muted")}>
                                {c.text}
                                {c.days > 1 && <Badge>×{c.days} 天</Badge>}
                                {!c.done && <Badge tone="warn">未完成</Badge>}
                                {state === "new" && <Badge tone="accent">新增</Badge>}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col rounded-lg border border-line">
            <div className="flex h-[33px] items-center gap-2 border-b border-line px-3 text-xs text-faint">
              汇总结果 · {r.items.length} 条
              {picked.length >= 2 ? (
                <Button
                  size="sm"
                  variant="primary"
                  className="ml-auto h-6 px-2 text-xs"
                  onClick={() => setMerging(picked.map((p) => p.text).join("；"))}
                >
                  <Merge size={13} />
                  合并 {picked.length} 条
                </Button>
              ) : (
                <span className="ml-auto max-md:hidden">勾选几条可以合并</span>
              )}
            </div>
            <ol className="flex flex-col p-1.5">
              {r.items.map((it, i) => (
                <ItemRow
                  key={it.id}
                  index={i}
                  item={it}
                  total={r.items.length}
                  selected={selected.includes(it.id)}
                  onSelect={(on) => setSelected(on ? [...selected, it.id] : selected.filter((x) => x !== it.id))}
                  onEdit={(t) => apply((d) => draftOps.edit(d, it.id, t))}
                  onMove={(n) => apply((d) => draftOps.move(d, it.id, n))}
                  onSplit={() => apply((d) => draftOps.split(d, it.id, textOf))}
                  onRemove={() => {
                    setSelected(selected.filter((x) => x !== it.id));
                    apply((d) => draftOps.remove(d, it.id));
                  }}
                />
              ))}
            </ol>
            <AddRow placeholder="添加一条（记录里没有的也可以写）" onAdd={(t) => apply((d) => draftOps.add(d, t))} />
          </div>
        </div>
      </section>

      <section aria-label="下周计划" className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-medium">下周计划</h3>
          <span className="text-xs text-faint">下周的周报里会逐条打勾</span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void copy("下周计划", r.planText)}>
            <Copy size={14} />
            复制
          </Button>
        </div>
        <div className="rounded-lg border border-line">
          {r.plan.length > 0 && (
            <ol className="flex flex-col p-1.5">
              {r.plan.map((p, i) => (
                <ItemRow
                  key={p.id}
                  index={i}
                  item={p}
                  total={r.plan.length}
                  onEdit={(t) => apply((d) => draftOps.planEdit(d, p.id, t))}
                  onMove={(n) => apply((d) => draftOps.planMove(d, p.id, n))}
                  onRemove={() => apply((d) => draftOps.planRemove(d, p.id))}
                />
              ))}
            </ol>
          )}
          <AddRow placeholder="添加下周要做的事" onAdd={(t) => apply((d) => draftOps.planAdd(d, t))} />
        </div>
        {r.planSuggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-faint">建议加入：</span>
            {r.planSuggestions.map((p: PlanItem) => (
              <button
                key={p.id}
                type="button"
                onClick={() => apply((d) => draftOps.planAdd(d, p.text, p.from))}
                className="flex max-w-full cursor-pointer items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-muted hover:border-accent/60 hover:text-fg"
              >
                <Plus size={12} className="shrink-0" />
                <span className="truncate">{p.text}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {r.days.length > 0 && (
        <details className="group rounded-lg border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-[13px] [&::-webkit-details-marker]:hidden">
            <ChevronRight size={14} className="text-muted transition-transform group-open:rotate-90" />
            <span className="font-medium">周报明细</span>
            <span className="text-faint">由每天的日报自动汇总，共 {r.days.length} 天，不用另外填写</span>
          </summary>
          <div className="border-t border-line">
            {r.days.map((d) => (
              <div
                key={d.date}
                className="grid grid-cols-[7.5rem_3.5rem_3.5rem_minmax(0,1fr)] gap-x-5 gap-y-2 border-b border-line px-4 py-3 last:border-b-0"
              >
                <CopyCell label="工作日期" value={d.date} mono />
                <CopyCell label="周几" value={d.weekday} />
                <CopyCell label="工时(h)" value={d.hours} mono />
                <CopyCell label="所属项目名称" value={d.projectName} />
                <CopyCell label="工作内容描述" value={d.content} wide />
              </div>
            ))}
          </div>
        </details>
      )}

      <MergeDialog
        text={merging}
        count={picked.length}
        onClose={() => setMerging(null)}
        onMerge={(t) => {
          apply((d) => draftOps.merge(d, selected, t));
          setSelected([]);
          setMerging(null);
        }}
      />
    </ReportCard>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone?: "warn" | "accent" }) {
  return (
    <span
      className={cx(
        "ml-1.5 inline-block rounded px-1 align-[1px] text-[11px] leading-4 whitespace-nowrap",
        tone === "warn"
          ? "bg-warn-soft text-warn-text"
          : tone === "accent"
            ? "bg-accent-soft text-accent-text"
            : "bg-chip text-muted",
      )}
    >
      {children}
    </span>
  );
}

/** 汇总结果、下周计划里的一条：点文字修改，右侧上移、下移、拆开、删除 */
function ItemRow({
  index,
  item,
  total,
  selected,
  onSelect,
  onEdit,
  onMove,
  onSplit,
  onRemove,
}: {
  index: number;
  item: SummaryItem | PlanItem;
  total: number;
  selected?: boolean;
  onSelect?: (on: boolean) => void;
  onEdit: (text: string) => void;
  onMove: (delta: number) => void;
  onSplit?: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  useEffect(() => setDraft(item.text), [item.text]);
  const from = "from" in item && Array.isArray(item.from) ? item.from : null;
  const save = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== item.text) onEdit(v);
    else setDraft(item.text);
  };
  return (
    <li
      className={cx(
        "group/item relative flex items-start gap-1.5 rounded px-1.5 py-1",
        selected ? "bg-accent-soft/60" : "hover:bg-hover",
      )}
    >
      {onSelect && (
        <Checkbox
          aria-label="选择这一条（用来合并）"
          checked={!!selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="mt-[3px]"
        />
      )}
      <span className="w-5 shrink-0 text-right text-[13px] leading-5 text-faint tabular-nums">{index + 1}.</span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <Textarea
            autoFocus
            rows={Math.max(1, Math.ceil(draft.length / 28))}
            value={draft}
            aria-label="修改内容"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                setDraft(item.text);
                setEditing(false);
              }
            }}
            className="resize-none px-1.5 py-0.5 text-[13px] leading-5"
          />
        ) : (
          <button
            type="button"
            title="点击修改"
            onClick={() => setEditing(true)}
            className="w-full cursor-text text-left text-[13px] leading-5 break-words"
          >
            {item.text}
            {from && from.length > 1 && <Badge>合并了 {from.length} 条</Badge>}
            {from && from.length === 0 && <Badge>手动添加</Badge>}
          </button>
        )}
      </div>
      <div className="absolute top-0.5 right-1 hidden rounded-md bg-menu shadow-pop group-hover/item:flex focus-within:flex pointer-coarse:static pointer-coarse:flex pointer-coarse:shrink-0 pointer-coarse:bg-transparent pointer-coarse:shadow-none">
        <IconButton label="上移" size="sm" className="size-6" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp size={13} />
        </IconButton>
        <IconButton label="下移" size="sm" className="size-6" disabled={index === total - 1} onClick={() => onMove(1)}>
          <ArrowDown size={13} />
        </IconButton>
        {onSplit && from && from.length > 1 && (
          <IconButton label="拆开" size="sm" className="size-6" onClick={onSplit}>
            <Ungroup size={13} />
          </IconButton>
        )}
        <IconButton label="删除" size="sm" className="size-6" onClick={onRemove}>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </li>
  );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [v, setV] = useState("");
  const add = () => {
    if (!v.trim()) return;
    onAdd(v.trim());
    setV("");
  };
  return (
    <div className="flex items-center gap-1.5 border-t border-line p-1.5">
      <Input
        value={v}
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) add();
        }}
        className="h-8 border-transparent text-[13px] shadow-none hover:border-control"
      />
      <IconButton label="添加" size="sm" onClick={add} disabled={!v.trim()}>
        <Plus size={15} />
      </IconButton>
    </div>
  );
}

function MergeDialog({
  text,
  count,
  onClose,
  onMerge,
}: {
  text: string | null;
  count: number;
  onClose: () => void;
  onMerge: (text: string) => void;
}) {
  const [v, setV] = useState("");
  useEffect(() => {
    if (text !== null) setV(text);
  }, [text]);
  return (
    <Dialog
      open={text !== null}
      onClose={onClose}
      size="sm"
      title={`合并 ${count} 条`}
      description="把几条改写成一句话，合并后还可以「拆开」"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!v.trim()} onClick={() => onMerge(v.trim())}>
            合并
          </Button>
        </>
      }
    >
      <Textarea
        data-autofocus
        rows={4}
        value={v}
        aria-label="合并后的内容"
        onChange={(e) => setV(e.target.value)}
        className="leading-6"
      />
    </Dialog>
  );
}
