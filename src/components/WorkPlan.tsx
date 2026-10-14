"use client";

import {
  ArrowRight,
  Ban,
  Check,
  Circle,
  CircleCheck,
  ClipboardCheck,
  Copy,
  Plus,
  Sunrise,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { api, readLocal } from "@/lib/client";
import {
  isPlanDone,
  planProgress,
  SOURCE_LABEL,
  type DayPlan,
  type DayPlanItem,
  type PlanCandidate,
  type PlanSource,
} from "@/lib/dayplan";
import { buildDaily, currentPeriod, dailyText, weekdayLabel, type WorkData, type WorkLog } from "@/lib/worklog";
import { Button, Checkbox, cx, Dialog, IconButton, Input, Select, Textarea } from "./ui";
import { useUI } from "./ui-context";
import { refreshWork, SubmitButton, useCopy, useSubmit } from "./work-ui";

const mmdd = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
const dayLabel = (date: string) => `${mmdd(date)} ${weekdayLabel(date)}`;

export function useDayPlan(date: string) {
  return useSWR(`/api/work/plan?date=${date}`, (url: string) => api<DayPlan>(url));
}

/** 改计划，改完刷新计划和工作记录 */
function usePlanOp(date: string) {
  const ui = useUI();
  const { mutate } = useDayPlan(date);
  const [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>): Promise<DayPlan | null> => {
    setBusy(true);
    try {
      const plan = await api<DayPlan>("/api/work/plan", { body: { date, ...body } });
      await mutate(plan, { revalidate: false });
      await refreshWork();
      return plan;
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

const SOURCE_CLASS: Record<PlanSource, string> = {
  manual: "",
  carry: "bg-accent-soft text-accent-text",
  leftover: "bg-accent-soft text-accent-text",
  weekly: "bg-success-soft text-success-text",
  unfinished: "bg-warn-soft text-warn-text",
  meeting: "bg-[#E8488B]/10 text-[#C2286B] dark:text-[#F28AB5]",
};

function SourceBadge({ source }: { source: PlanSource }) {
  if (!SOURCE_LABEL[source]) return null;
  return (
    <span className={cx("shrink-0 rounded px-1.5 text-[11px] leading-[18px]", SOURCE_CLASS[source])}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

/* ---------- 今日计划卡片（日报页输入框上面） ---------- */

export function DayPlanCard({
  date,
  today,
  data,
  onPlan,
  onShutdown,
}: {
  date: string;
  today: string;
  data: WorkData;
  onPlan: () => void;
  onShutdown: () => void;
}) {
  const ui = useUI();
  const { data: plan } = useDayPlan(date);
  const op = usePlanOp(date);
  const [adding, setAdding] = useState("");
  const todayLogs = useMemo(() => data.logs.filter((l) => l.date === date), [data, date]);
  if (!plan) return null;

  const { done, total } = planProgress(plan.items, todayLogs);
  const isToday = date === today;
  const projectName = (id: number | null) => data.projects.find((p) => p.id === id)?.name;

  const toggle = async (item: DayPlanItem) => {
    if (isPlanDone(item, todayLogs) && item.status === "done") {
      await op.run({ op: "uncheck", id: item.id });
      return;
    }
    const next = await op.run({ op: "check", id: item.id, period: currentPeriod() });
    if (next) {
      ui.toast("已记进今天的工作记录", {
        action: { label: "撤销", onClick: () => void op.run({ op: "uncheck", id: item.id }) },
      });
    }
  };

  const add = async () => {
    const text = adding.trim();
    if (!text) return;
    const projectId = readLocal<number | null>("mydoc.workProject", null);
    const valid = data.projects.some((p) => p.id === projectId && !p.archived) ? projectId : null;
    if (await op.run({ op: "add", items: [{ text, projectId: valid, source: "manual" }] })) setAdding("");
  };

  return (
    <section
      aria-label={isToday ? "今日计划" : `${mmdd(date)}的计划`}
      className="rounded-xl border border-line bg-surface"
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Sunrise size={16} className="shrink-0 text-[#F59E0B]" />
        <h2 className="shrink-0 text-[14px] font-medium whitespace-nowrap">
          {isToday ? "今日计划" : `${dayLabel(date)}的计划`}
        </h2>
        {total > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-faint tabular-nums">
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-field max-sm:hidden">
              <span className="block h-full rounded-full bg-success" style={{ width: `${(done / total) * 100}%` }} />
            </span>
            {done}/{total}
          </span>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onPlan}>
          <Plus size={14} />
          {plan.items.length ? "安排" : "开工"}
        </Button>
        {date <= today && (
          <Button
            size="sm"
            onClick={onShutdown}
            className={cx(plan.shutdownAt && "border-success/40 text-success-text hover:bg-success-soft")}
          >
            {plan.shutdownAt ? <CircleCheck size={14} /> : <ClipboardCheck size={14} />}
            {plan.shutdownAt ? "已收工" : "收工"}
          </Button>
        )}
      </div>

      {plan.items.length === 0 ? (
        <button
          type="button"
          onClick={onPlan}
          className="mx-4 mb-3 flex w-[calc(100%-2rem)] cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-left text-[13px] text-muted hover:border-accent/60 hover:text-fg"
        >
          <span className="min-w-0 flex-1">
            {isToday ? "开工前花一分钟，挑几件今天要做的事" : "还没有安排计划"}
            {plan.candidates.length > 0 && (
              <span className="text-faint">（有 {plan.candidates.length} 件待处理的事可以挑）</span>
            )}
          </span>
          <ArrowRight size={14} className="shrink-0" />
        </button>
      ) : (
        <ul className="border-t border-line">
          {plan.items.map((item) => (
            <PlanRow
              key={item.id}
              item={item}
              done={isPlanDone(item, todayLogs)}
              project={projectName(item.projectId)}
              onToggle={() => void toggle(item)}
              onOp={(o) => void op.run({ op: o, id: item.id })}
            />
          ))}
          <li className="flex items-center gap-2.5 px-4 py-1.5">
            <Plus size={16} className="shrink-0 text-icon" />
            <Input
              value={adding}
              aria-label="添加计划"
              placeholder="添加计划，回车"
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void add();
              }}
              className="h-8 border-0 px-0 shadow-none hover:border-0 focus:ring-0"
            />
          </li>
        </ul>
      )}
    </section>
  );
}

function PlanRow({
  item,
  done,
  project,
  onToggle,
  onOp,
}: {
  item: DayPlanItem;
  done: boolean;
  project?: string;
  onToggle: () => void;
  onOp: (op: "carry" | "drop" | "restore" | "remove") => void;
}) {
  const closed = item.status === "carried" || item.status === "dropped";
  return (
    <li className="group/plan flex items-start gap-2.5 border-b border-line px-4 py-2 last:border-b-0">
      {closed ? (
        <span className="mt-0.5 shrink-0 text-icon">
          {item.status === "carried" ? <ArrowRight size={18} /> : <Ban size={18} />}
        </span>
      ) : (
        <button
          type="button"
          aria-label={done ? "标记为没做完" : "做完了，记进工作记录"}
          title={done ? "取消打勾" : "做完了，记进今天的工作记录"}
          onClick={onToggle}
          className="mt-0.5 shrink-0 cursor-pointer"
        >
          {done ? <CircleCheck size={18} className="text-success" /> : <Circle size={18} className="text-icon" />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className={cx("leading-6 break-words", (done || closed) && "text-muted", closed && "line-through")}>
          {item.text}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
          <SourceBadge source={item.source} />
          {project && <span className="truncate">{project}</span>}
          {item.status === "carried" && item.carriedTo && <span>已顺延到 {dayLabel(item.carriedTo)}</span>}
          {item.status === "dropped" && <span>不做了</span>}
          {done && <span className="text-success-text">已记进工作记录</span>}
        </div>
      </div>
      <div className="flex shrink-0 opacity-0 group-hover/plan:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
        {closed ? (
          <IconButton label="恢复" size="sm" onClick={() => onOp("restore")}>
            <Undo2 size={15} />
          </IconButton>
        ) : (
          !done && (
            <>
              <IconButton label="顺延到下一个工作日" size="sm" onClick={() => onOp("carry")}>
                <ArrowRight size={15} />
              </IconButton>
              <IconButton label="不做了" size="sm" onClick={() => onOp("drop")}>
                <Ban size={15} />
              </IconButton>
            </>
          )
        )}
        <IconButton label="删除" size="sm" onClick={() => onOp("remove")}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </li>
  );
}

/* ---------- 开工：挑今天要做的事 ---------- */

const GROUPS: [PlanSource, string][] = [
  ["leftover", "前几天没处理的计划"],
  ["weekly", "本周计划"],
  ["unfinished", "没做完的记录"],
  ["meeting", "会议待办"],
];

export function PlanDialog({
  open,
  onClose,
  date,
  today,
  data,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  today: string;
  data: WorkData;
}) {
  const { data: plan } = useDayPlan(date);
  const op = usePlanOp(date);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const projects = data.projects.filter((p) => !p.archived);

  // 打开时：前几天没处理的计划默认勾上
  useEffect(() => {
    if (!open || !plan) return;
    setPicked(new Set(plan.candidates.filter((c) => c.source === "leftover").map((c) => c.key)));
    setExtra("");
    const saved = readLocal<number | null>("mydoc.workProject", null);
    setProjectId(projects.some((p) => p.id === saved) ? saved : (projects[0]?.id ?? null));
  }, [open, !!plan]);

  const lines = extra
    .split("\n")
    .map((s) => s.replace(/^\s*(?:[-*+]|\d+[.、)])\s*/, "").trim())
    .filter(Boolean);
  const count = picked.size + lines.length;
  const toggle = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  };

  const save = async () => {
    if (!plan || !count) return;
    const chosen = plan.candidates.filter((c) => picked.has(c.key));
    const items = [
      ...chosen.map((c) => ({ text: c.text, projectId: c.projectId, source: c.source, ref: c.ref })),
      ...lines.map((text) => ({ text, projectId, source: "manual" as const })),
    ];
    if (await op.run({ op: "add", items })) onClose();
  };

  const projectName = (id: number | null) => data.projects.find((p) => p.id === id)?.name;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={date === today ? "开工：安排今天的计划" : `安排 ${dayLabel(date)} 的计划`}
      description="挑几件要做的事；做完了在计划里打勾，就会记进工作记录"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={op.busy} disabled={!count} onClick={() => void save()}>
            {count ? `加入计划（${count} 件）` : "加入计划"}
          </Button>
        </>
      }
    >
      {!plan ? null : (
        <div className="flex flex-col gap-5">
          {plan.candidates.length === 0 && (
            <p className="rounded-lg bg-field px-4 py-3 text-[13px] text-muted">
              没有待处理的事（前几天的计划、本周计划、没做完的记录、会议待办都处理完了），直接在下面写要做的事吧
            </p>
          )}
          {GROUPS.map(([source, title]) => {
            const list = plan.candidates.filter((c) => c.source === source);
            if (!list.length) return null;
            return (
              <section key={source} aria-label={title}>
                <h3 className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium">
                  {title}
                  <span className="font-normal text-faint">{list.length}</span>
                </h3>
                <ul className="overflow-hidden rounded-lg border border-line">
                  {list.map((c) => (
                    <CandidateRow
                      key={c.key}
                      c={c}
                      checked={picked.has(c.key)}
                      project={projectName(c.projectId)}
                      onToggle={() => toggle(c.key)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
          <section aria-label="其他要做的事">
            <h3 className="mb-1.5 text-[13px] font-medium">其他要做的事</h3>
            <Textarea
              rows={3}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder={"一行一件，例如：\n评审分段导入方案"}
              className="leading-6"
            />
            {projects.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-[13px] text-muted">
                报工项目
                <Select
                  aria-label="其他要做的事的报工项目"
                  value={projectId ?? ""}
                  onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
                  className="w-auto max-w-[280px] min-w-0 flex-1"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="">未选择项目</option>
                </Select>
              </div>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

function CandidateRow({
  c,
  checked,
  project,
  onToggle,
}: {
  c: PlanCandidate;
  checked: boolean;
  project?: string;
  onToggle: () => void;
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-hover">
        <Checkbox checked={checked} onChange={onToggle} className="mt-1" />
        <span className="min-w-0 flex-1">
          <span className="block leading-6 break-words">{c.text}</span>
          <span className="block truncate text-xs text-faint">{[c.note, project].filter(Boolean).join(" · ")}</span>
        </span>
      </label>
    </li>
  );
}

/* ---------- 收工：核对计划、补记、整理日报 ---------- */

export function ShutdownDialog({
  open,
  onClose,
  date,
  data,
  run,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  data: WorkData;
  run: (fn: () => Promise<unknown>) => Promise<unknown>;
}) {
  const ui = useUI();
  const { data: plan } = useDayPlan(date);
  const op = usePlanOp(date);
  const copy = useCopy();
  const submit = useSubmit();
  const [extra, setExtra] = useState("");
  const todayLogs = useMemo(() => data.logs.filter((l) => l.date === date), [data, date]);
  const daily = useMemo(() => buildDaily(data, date), [data, date]);
  const projectName = (id: number | null) => data.projects.find((p) => p.id === id)?.name;

  if (!plan) return null;
  const items = plan.items;
  const open_ = items.filter((i) => i.status === "todo" && !isPlanDone(i, todayLogs));
  const carried = items.filter((i) => i.status === "carried");
  const { done, total } = planProgress(items, todayLogs);

  const addLog = async () => {
    const text = extra.trim();
    if (!text) return;
    const projectId = readLocal<number | null>("mydoc.workProject", null);
    await run(() =>
      api("/api/work/logs", {
        body: {
          date,
          period: currentPeriod(),
          projectId: data.projects.some((p) => p.id === projectId) ? projectId : null,
          contents: [text],
        },
      }),
    );
    setExtra("");
  };

  const finish = async () => {
    if (!(await op.run({ op: "shutdown" }))) return;
    onClose();
    const n = carried.length;
    ui.toast(n ? `收工了，辛苦！已有 ${n} 件顺延到 ${dayLabel(plan.nextWorkday)}` : "收工了，辛苦！");
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`收工 · ${dayLabel(date)}`}
      description="过一遍今天的计划和记录，日报就整理好了"
      footer={
        <>
          <Button onClick={onClose}>稍后再说</Button>
          <Button variant="primary" loading={op.busy} onClick={() => void finish()}>
            <Check size={15} />
            完成收工
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section aria-label="核对计划">
          <h3 className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium">
            <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-[11px] text-accent-text">
              1
            </span>
            核对计划
            {total > 0 && (
              <span className="font-normal text-faint">
                完成 {done}/{total}
                {carried.length > 0 && ` · 顺延 ${carried.length}`}
              </span>
            )}
          </h3>
          {items.length === 0 ? (
            <p className="text-[13px] text-faint">今天没有安排计划，明天开工时可以先挑几件要做的事</p>
          ) : open_.length === 0 ? (
            <p className="rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success-text">计划里的事都处理完了</p>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-line">
              {open_.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-[12rem] flex-1">
                    <span className="block leading-6 break-words">{item.text}</span>
                    <span className="flex items-center gap-2 text-xs text-faint">
                      <SourceBadge source={item.source} />
                      {projectName(item.projectId)}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => void op.run({ op: "check", id: item.id, period: currentPeriod() })}
                    >
                      <CircleCheck size={14} />
                      完成了
                    </Button>
                    <Button size="sm" onClick={() => void op.run({ op: "carry", id: item.id })}>
                      <ArrowRight size={14} />
                      顺延到{weekdayLabel(plan.nextWorkday)}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void op.run({ op: "drop", id: item.id })}>
                      不做了
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="今天的记录">
          <h3 className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium">
            <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-[11px] text-accent-text">
              2
            </span>
            今天的记录
            <span className="font-normal text-faint">
              {todayLogs.length} 条 · 没做完的点一下圆圈，会放进周报的下周计划
            </span>
          </h3>
          <ul className="max-h-64 overflow-y-auto rounded-lg border border-line">
            {todayLogs.map((l) => (
              <ShutdownLogRow
                key={l.id}
                log={l}
                project={projectName(l.projectId)}
                onToggle={() =>
                  void run(() => api(`/api/work/logs/${l.id}`, { method: "PATCH", body: { done: !l.done } }))
                }
              />
            ))}
            <li className="flex items-center gap-2.5 px-3 py-1.5">
              <Plus size={16} className="shrink-0 text-icon" />
              <Input
                value={extra}
                aria-label="补记一条"
                placeholder="还有漏记的？写一句，回车添加"
                onChange={(e) => setExtra(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) void addLog();
                }}
                className="h-8 border-0 px-0 shadow-none hover:border-0 focus:ring-0"
              />
            </li>
          </ul>
        </section>

        <section aria-label="日报">
          <h3 className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium">
            <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-[11px] text-accent-text">
              3
            </span>
            日报
          </h3>
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-field px-4 py-3">
            <p className="min-w-0 flex-1 text-[13px] text-muted max-sm:basis-full">
              {daily.logCount
                ? `已按公司格式整理好（${daily.rows.length} 个项目、${daily.logCount} 条），复制后粘贴到公司系统`
                : "今天还没有记录，先在上面补几条"}
            </p>
            <Button size="sm" disabled={!daily.logCount} onClick={() => void copy("整张日报", dailyText(daily))}>
              <Copy size={14} />
              复制日报
            </Button>
            <SubmitButton
              submitted={!!daily.submittedAt}
              busy={submit.busy}
              disabled={!daily.logCount}
              onToggle={(on) => void submit.set("daily", date, on, "日报")}
            />
          </div>
        </section>
      </div>
    </Dialog>
  );
}

function ShutdownLogRow({ log, project, onToggle }: { log: WorkLog; project?: string; onToggle: () => void }) {
  return (
    <li className="flex items-start gap-2.5 border-b border-line px-3 py-2">
      <button
        type="button"
        aria-label={log.done ? "标记为未完成" : "标记为已完成"}
        onClick={onToggle}
        className="mt-0.5 shrink-0 cursor-pointer"
      >
        {log.done ? <CircleCheck size={18} className="text-success" /> : <Circle size={18} className="text-warn" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className="block leading-6 break-words">{log.content}</span>
        <span className="flex gap-2 text-xs text-faint">
          {project ?? "未选择项目"}
          <span>{log.period === "am" ? "上午" : "下午"}</span>
          {!log.done && <span className="text-warn-text">未完成</span>}
        </span>
      </span>
    </li>
  );
}
