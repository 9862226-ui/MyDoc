"use client";

import {
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Copy,
  Bell,
  FolderCog,
  NotebookPen,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import NextLink from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { api, copyText, readLocal, writeLocal } from "@/lib/client";
import { localDate } from "@/lib/format";
import {
  buildDaily,
  buildWeekly,
  currentPeriod,
  dailyText,
  shiftDate,
  splitEntries,
  weekdayLabel,
  weekStart,
  weeklyText,
  type DailyReport,
  type Period,
  type WeeklyReport,
  type WorkData,
  type WorkLog,
  type WorkProject,
} from "@/lib/worklog";
import { LastResult } from "./settings-ui";
import {
  Banner,
  Button,
  Checkbox,
  cx,
  Dialog,
  Field,
  IconButton,
  Input,
  Select,
  Skeleton,
  Spinner,
  Tabs,
  Textarea,
} from "./ui";
import { useUI } from "./ui-context";

type Kind = "daily" | "weekly";

const workKey = (date: string) => `/api/work?date=${weekStart(date)}`;

function useWork(date: string) {
  return useSWR(workKey(date), (url: string) => api<WorkData>(url));
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "am", label: "上午" },
  { value: "pm", label: "下午" },
];

const mmdd = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;

/** 复制并提示 */
function useCopy() {
  const ui = useUI();
  return async (label: string, value: string) => {
    if (!value.trim()) return ui.toast(`「${label}」是空的`, { kind: "info" });
    const ok = await copyText(value);
    ui.toast(ok ? `已复制「${label}」` : "复制失败，请手动选择文字复制", { kind: ok ? "ok" : "error" });
  };
}

export function WorkView() {
  const ui = useUI();
  const [kind, setKind] = useState<Kind>("daily");
  const [date, setDate] = useState(() => localDate());
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const { data, mutate } = useWork(date);
  const today = localDate();

  useEffect(() => {
    const saved = readLocal<Kind>("mydoc.workTab", "daily");
    if (saved === "weekly") setKind("weekly");
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await mutate();
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const step = kind === "daily" ? 1 : 7;
  const isCurrent = kind === "daily" ? date === today : weekStart(date) === weekStart(today);
  const daily = useMemo(() => (data ? buildDaily(data, date) : null), [data, date]);
  const weekly = useMemo(() => (data ? buildWeekly(data, date) : null), [data, date]);

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pt-4 pb-12 md:px-8 md:pt-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-[#13A3A3] text-white md:size-12"
        >
          <NotebookPen size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="hidden text-xl leading-7 font-semibold md:block">工作记录</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            随手记下做了什么，按公司的格式整理成日报、周报，一项一项复制过去
          </p>
        </div>
        <div className="flex shrink-0 gap-2 max-md:hidden">
          <Button onClick={() => setRemindOpen(true)}>
            <Bell size={16} />
            {data?.settings.remindDaily ? `每天 ${data.settings.remindTime} 提醒` : "下班提醒"}
          </Button>
          <Button onClick={() => setProjectsOpen(true)}>
            <FolderCog size={16} />
            报工项目
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line">
        <Tabs
          label="报告类型"
          value={kind}
          onChange={(k) => {
            setKind(k);
            writeLocal("mydoc.workTab", k);
          }}
          items={[
            { value: "daily", label: "日报" },
            { value: "weekly", label: "周报" },
          ]}
        />
        <div className="flex items-center gap-1 pb-1.5 max-md:w-full max-md:justify-between">
          <IconButton label={kind === "daily" ? "前一天" : "上一周"} onClick={() => setDate(shiftDate(date, -step))}>
            <ChevronLeft size={18} />
          </IconButton>
          <span className="text-center text-[15px] font-medium tabular-nums max-md:min-w-0 max-md:flex-1 md:min-w-[168px]">
            {kind === "daily"
              ? `${mmdd(date)} ${weekdayLabel(date)}`
              : weekly
                ? `第 ${weekly.week} 周 · ${mmdd(weekly.start)} ~ ${mmdd(weekly.end)}`
                : ""}
          </span>
          <IconButton label={kind === "daily" ? "后一天" : "下一周"} onClick={() => setDate(shiftDate(date, step))}>
            <ChevronRight size={18} />
          </IconButton>
          <Button size="sm" variant="ghost" disabled={isCurrent} onClick={() => setDate(today)} className="ml-1">
            {kind === "daily" ? "今天" : "本周"}
          </Button>
          <IconButton label="下班提醒" onClick={() => setRemindOpen(true)} className="md:hidden">
            <Bell size={18} />
          </IconButton>
          <IconButton label="报工项目" onClick={() => setProjectsOpen(true)} className="md:hidden">
            <FolderCog size={18} />
          </IconButton>
        </div>
      </div>

      {!data || !daily || !weekly ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Composer
              data={data}
              date={date}
              onAdd={(body) => run(() => api("/api/work/logs", { body }))}
              onManageProjects={() => setProjectsOpen(true)}
            />
            <LogList data={data} kind={kind} date={date} run={run} mutate={mutate} />
          </div>
          {kind === "daily" ? (
            <DailyCard report={daily} date={date} run={run} />
          ) : (
            <WeeklyCard report={weekly} date={date} run={run} />
          )}
        </div>
      )}

      {data && <ProjectsDialog open={projectsOpen} onClose={() => setProjectsOpen(false)} data={data} run={run} />}
      {data && <RemindDialog open={remindOpen} onClose={() => setRemindOpen(false)} data={data} run={run} />}
    </div>
  );
}

/* ---------- 记一笔 ---------- */

function Composer({
  data,
  date,
  onAdd,
  onManageProjects,
}: {
  data: WorkData;
  date: string;
  onAdd: (body: object) => Promise<void>;
  onManageProjects: () => void;
}) {
  const [text, setText] = useState("");
  const [period, setPeriod] = useState<Period>("am");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const projects = data.projects.filter((p) => !p.archived);

  useEffect(() => {
    setPeriod(currentPeriod());
    const saved = readLocal<number | null>("mydoc.workProject", null);
    setProjectId(saved);
  }, []);

  // 记住的项目被删掉时，默认用第一个项目
  const current = projects.some((p) => p.id === projectId) ? projectId : (projects[0]?.id ?? null);
  const entries = splitEntries(text);

  const submit = async () => {
    if (!entries.length || busy) return;
    setBusy(true);
    await onAdd({ date, period, projectId: current, contents: entries });
    setBusy(false);
    setText("");
  };

  return (
    <section aria-label="记一笔" className="rounded-xl border border-line bg-surface p-4">
      <Textarea
        id="work-input"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        aria-label="工作内容"
        placeholder={`${date === localDate() ? "今天" : mmdd(date)}做了什么？一行一条，回车添加（Shift + 回车换行）\n例如：修复文件删除后切片未清理的问题`}
        className="resize-none border-0 px-0 py-0 text-[15px] leading-6 shadow-none hover:border-0 focus:ring-0"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {projects.length ? (
          <Select
            aria-label="报工项目"
            value={current ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setProjectId(v);
              writeLocal("mydoc.workProject", v);
            }}
            className="w-auto max-w-full min-w-0 flex-1 sm:max-w-[260px]"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="">未选择项目</option>
          </Select>
        ) : (
          <button
            type="button"
            onClick={onManageProjects}
            className="h-9 cursor-pointer rounded-md border border-dashed border-line-strong px-3 text-[13px] text-muted hover:border-accent/60 hover:text-fg"
          >
            + 添加报工项目（项目名称、编号）
          </button>
        )}
        <div role="radiogroup" aria-label="时段" className="flex shrink-0 rounded-md bg-field p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={cx(
                "h-8 cursor-pointer rounded px-3 text-[13px] transition-colors",
                period === p.value
                  ? "bg-surface font-medium text-fg shadow-[0_1px_2px_var(--shadow)] dark:bg-chip"
                  : "text-muted hover:text-fg",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button
          variant="primary"
          loading={busy}
          disabled={!entries.length}
          onClick={() => void submit()}
          className="ml-auto"
        >
          {entries.length > 1 ? `添加 ${entries.length} 条` : "添加"}
        </Button>
      </div>
    </section>
  );
}

/* ---------- 记录列表 ---------- */

function LogList({
  data,
  kind,
  date,
  run,
  mutate,
}: {
  data: WorkData;
  kind: Kind;
  date: string;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  mutate: () => Promise<unknown>;
}) {
  const ui = useUI();
  const groups = useMemo(() => {
    if (kind === "daily") {
      const logs = data.logs.filter((l) => l.date === date);
      return PERIODS.map((p) => ({
        key: p.value,
        title: p.label,
        logs: logs.filter((l) => l.period === p.value),
      })).filter((g) => g.logs.length);
    }
    const start = weekStart(date);
    return Array.from({ length: 7 }, (_, i) => shiftDate(start, i))
      .map((d) => ({ key: d, title: `${mmdd(d)} ${weekdayLabel(d)}`, logs: data.logs.filter((l) => l.date === d) }))
      .filter((g) => g.logs.length);
  }, [data, kind, date]);

  const remove = async (l: WorkLog) => {
    try {
      await api(`/api/work/logs/${l.id}`, { method: "DELETE" });
      await mutate();
      ui.toast("已删除", {
        action: {
          label: "撤销",
          onClick: () =>
            void run(() =>
              api("/api/work/logs", {
                body: {
                  date: l.date,
                  period: l.period,
                  projectId: l.projectId,
                  contents: [l.content],
                  hours: l.hours,
                  done: l.done,
                },
              }),
            ),
        },
      });
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  if (!groups.length) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[13px] leading-6 text-faint">
        {kind === "daily" ? "这一天还没有记录" : "这一周还没有记录"}
        <br />
        干完一件事就记一句，下班前日报就整理好了
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title}>
          <h3 className="px-1 pb-1.5 text-xs text-faint">
            {g.title} · {g.logs.length} 条
          </h3>
          <ul className="overflow-hidden rounded-xl border border-line bg-surface">
            {g.logs.map((l) => (
              <LogRow
                key={l.id}
                log={l}
                project={data.projects.find((p) => p.id === l.projectId)}
                showPeriod={kind === "weekly"}
                onPatch={(patch) => run(() => api(`/api/work/logs/${l.id}`, { method: "PATCH", body: patch }))}
                onDelete={() => void remove(l)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LogRow({
  log,
  project,
  showPeriod,
  onPatch,
  onDelete,
}: {
  log: WorkLog;
  project?: WorkProject;
  showPeriod: boolean;
  onPatch: (patch: Partial<WorkLog>) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(log.content);
  const save = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== log.content) void onPatch({ content: v });
    else setDraft(log.content);
  };
  return (
    <li className="group/log flex items-start gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0">
      <button
        type="button"
        aria-label={log.done ? "标记为未完成" : "标记为已完成"}
        title={log.done ? "已完成（点一下改成未完成，会放进下周计划）" : "未完成（点一下改成已完成）"}
        onClick={() => void onPatch({ done: !log.done })}
        className="mt-0.5 shrink-0 cursor-pointer"
      >
        {log.done ? <CircleCheck size={18} className="text-success" /> : <Circle size={18} className="text-warn" />}
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            aria-label="修改工作内容"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
              if (e.key === "Escape") {
                setDraft(log.content);
                setEditing(false);
              }
            }}
            className="h-8"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full cursor-text text-left leading-6 break-words"
            title="点击修改"
          >
            {log.content}
          </button>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
          <span className="truncate">{project?.name ?? "未选择项目"}</span>
          {showPeriod && <span>{log.period === "am" ? "上午" : "下午"}</span>}
          {log.hours !== null && <span>{log.hours} 小时</span>}
          {!log.done && <span className="text-warn-text">未完成</span>}
          {log.source === "mcp" && <span>AI 助手记录</span>}
        </div>
      </div>
      <IconButton
        label="删除"
        size="sm"
        onClick={onDelete}
        className="shrink-0 opacity-0 group-hover/log:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
      >
        <Trash2 size={15} />
      </IconButton>
    </li>
  );
}

/* ---------- 日报、周报 ---------- */

/** 一个可以复制的字段，样子接近公司系统里的一格 */
function CopyCell({
  label,
  value,
  wide,
  mono,
}: {
  label: string;
  value: string | number;
  wide?: boolean;
  mono?: boolean;
}) {
  const copy = useCopy();
  const text = String(value);
  return (
    <div className={cx("group/cell min-w-0", wide && "col-span-full")}>
      <div className="text-xs text-faint">{label}</div>
      <button
        type="button"
        onClick={() => void copy(label, text)}
        title="点击复制"
        className={cx(
          "-mx-1.5 mt-0.5 flex w-[calc(100%+12px)] cursor-pointer items-start gap-1.5 rounded px-1.5 py-0.5 text-left hover:bg-hover",
          mono && "tabular-nums",
        )}
      >
        <span className={cx("min-w-0 flex-1 break-words", !text && "text-faint")}>{text || "—"}</span>
        <Copy
          size={13}
          className="mt-1 shrink-0 text-icon opacity-0 group-hover/cell:opacity-100 pointer-coarse:opacity-60"
        />
      </button>
    </div>
  );
}

/** 可编辑的总结：自动生成，改过之后保存，可以恢复自动生成 */
function SummaryField({
  label,
  value,
  auto,
  onSave,
}: {
  label: string;
  value: string;
  auto: string;
  onSave: (v: string | null) => Promise<void>;
}) {
  const copy = useCopy();
  const [draft, setDraft] = useState(value);
  const edited = value !== auto;
  useEffect(() => setDraft(value), [value]);
  const id = `summary-${label}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </label>
        {edited && (
          <>
            <span className="text-xs text-faint">已修改</span>
            <button
              type="button"
              onClick={() => void onSave(null)}
              className="flex cursor-pointer items-center gap-1 text-xs text-muted hover:text-fg"
            >
              <RotateCcw size={12} />
              恢复自动生成
            </button>
          </>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void copy(label, draft)}>
          <Copy size={14} />
          复制
        </Button>
      </div>
      <Textarea
        id={id}
        rows={Math.min(10, Math.max(3, draft.split("\n").length + 1))}
        value={draft}
        placeholder={`添加记录后自动生成${label}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) void onSave(draft === auto ? null : draft);
        }}
        className="leading-6"
      />
    </div>
  );
}

function ReportCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-5 rounded-xl border border-line bg-surface p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-6 font-semibold">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      {children}
    </section>
  );
}

function useAiPolish(kind: Kind, date: string, run: (fn: () => Promise<unknown>) => Promise<void>) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const polish = async () => {
    setBusy(true);
    await run(async () => {
      await api("/api/work/ai", { body: { kind, date } });
      ui.toast("AI 已整理好总结，不满意可以直接修改，或者点「恢复自动生成」");
    });
    setBusy(false);
  };
  return { busy, polish };
}

const saveFields = (kind: Kind, key: string, fields: Record<string, string | null>) =>
  api("/api/work/reports", { method: "PUT", body: { kind, key, fields } });

function DailyCard({
  report: r,
  date,
  run,
}: {
  report: DailyReport;
  date: string;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const copy = useCopy();
  const ai = useAiPolish("daily", date, run);
  return (
    <ReportCard
      title="工作日报"
      subtitle={r.logCount ? `${r.logCount} 条记录 · 点任意一格复制，粘贴到公司系统对应的位置` : "还没有记录"}
      actions={
        <>
          <Button size="sm" onClick={() => void ai.polish()} loading={ai.busy} disabled={!r.logCount}>
            {!ai.busy && <Sparkles size={14} />}
            AI 整理
          </Button>
          <Button size="sm" onClick={() => void copy("整张日报", dailyText(r))} disabled={!r.logCount}>
            <Copy size={14} />
            复制全文
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-field px-4 py-3 sm:grid-cols-4">
        <CopyCell label="日报日期" value={r.date} mono />
        <CopyCell label="正常工时(小时)" value={r.hours} mono />
        <div className="col-span-2 grid grid-cols-1 gap-y-3">
          <CopyCell label="上午主要项目" value={r.amProject} />
          <CopyCell label="下午主要项目" value={r.pmProject} />
        </div>
      </div>

      {r.rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-medium">日报明细</h3>
          {r.rows.map((row) => (
            <div
              key={row.projectId ?? "none"}
              className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-line px-4 py-3 sm:grid-cols-4"
            >
              <div className="col-span-2">
                <CopyCell label="项目名称" value={row.projectName} />
              </div>
              <CopyCell label="任务名称" value={row.taskName} />
              <CopyCell label="任务编号" value={row.taskCode} mono />
              <CopyCell label="任务状态" value={row.status} />
              <CopyCell label="当前进度(%)" value={row.progress} mono />
              <CopyCell label="工时(小时)" value={row.hours} mono />
              <CopyCell label="项目编号" value={row.projectCode} mono />
              <CopyCell label="今日工作内容" value={row.content} wide />
            </div>
          ))}
        </div>
      )}

      <SummaryField
        label="上午总结"
        value={r.amSummary}
        auto={r.autoAmSummary}
        onSave={(v) => run(() => saveFields("daily", date, { amSummary: v }))}
      />
      <SummaryField
        label="下午总结"
        value={r.pmSummary}
        auto={r.autoPmSummary}
        onSave={(v) => run(() => saveFields("daily", date, { pmSummary: v }))}
      />
    </ReportCard>
  );
}

function WeeklyCard({
  report: r,
  date,
  run,
}: {
  report: WeeklyReport;
  date: string;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const copy = useCopy();
  const ai = useAiPolish("weekly", date, run);
  return (
    <ReportCard
      title="员工周报"
      subtitle={r.logCount ? `${r.logCount} 条记录 · 点任意一格复制` : "这一周还没有记录"}
      actions={
        <>
          <Button size="sm" onClick={() => void ai.polish()} loading={ai.busy} disabled={!r.logCount}>
            {!ai.busy && <Sparkles size={14} />}
            AI 整理
          </Button>
          <Button size="sm" onClick={() => void copy("整张周报", weeklyText(r))} disabled={!r.logCount}>
            <Copy size={14} />
            复制全文
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-field px-4 py-3 sm:grid-cols-4">
        <CopyCell label="周次" value={r.week} mono />
        <CopyCell label="周工作天数" value={r.workDays} mono />
        <CopyCell label="起始日期" value={r.start} mono />
        <CopyCell label="结束日期" value={r.end} mono />
      </div>

      <SummaryField
        label="本周总结"
        value={r.summary}
        auto={r.autoSummary}
        onSave={(v) => run(() => saveFields("weekly", date, { summary: v }))}
      />
      <SummaryField
        label="下周计划"
        value={r.plan}
        auto={r.autoPlan}
        onSave={(v) => run(() => saveFields("weekly", date, { plan: v }))}
      />

      {r.days.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-medium">周报明细</h3>
          <div className="overflow-hidden rounded-lg border border-line">
            {r.days.map((d) => (
              <div
                key={d.date}
                className="grid grid-cols-[7.5rem_3.5rem_3.5rem_minmax(0,1fr)] gap-x-5 gap-y-2 border-b border-line px-4 py-3 last:border-b-0"
              >
                <CopyCell label="工作日期" value={d.date} mono />
                <CopyCell label="周几" value={d.weekday} />
                <CopyCell label="工时(h)" value={d.hours} mono />
                <CopyCell label="项目编号" value={d.projectCode} mono />
                <CopyCell label="所属项目名称" value={d.projectName} wide />
                <CopyCell label="工作内容描述" value={d.content} wide />
              </div>
            ))}
          </div>
        </div>
      )}
    </ReportCard>
  );
}

/* ---------- 报工项目 ---------- */

function ProjectsDialog({
  open,
  onClose,
  data,
  run,
}: {
  open: boolean;
  onClose: () => void;
  data: WorkData;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const ui = useUI();
  const [hours, setHours] = useState(String(data.settings.dailyHours));
  useEffect(() => setHours(String(data.settings.dailyHours)), [data.settings.dailyHours]);

  const remove = async (p: WorkProject) => {
    const ok = await ui.confirm({
      title: `删除项目「${p.name}」？`,
      message: "已有的记录会保留，只是不再属于这个项目。不想再选到它的话，也可以只「停用」。",
      confirmText: "删除",
      danger: true,
    });
    if (ok) void run(() => api(`/api/work/projects/${p.id}`, { method: "DELETE" }));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="报工项目"
      description="和公司系统里的项目对应起来，日报里的项目名称、编号、任务编号就能直接复制"
      footer={<Button onClick={onClose}>完成</Button>}
    >
      <div className="flex flex-col gap-3">
        {data.projects.length > 0 && (
          <div aria-hidden className="flex gap-2 pr-[92px] text-xs text-faint max-sm:hidden">
            <div className={cx(PROJECT_GRID, "flex-1 px-2.5")}>
              {PROJECT_FIELDS.map((f) => (
                <span key={f.key}>{f.label}</span>
              ))}
            </div>
          </div>
        )}
        {data.projects.map((p) => (
          <ProjectEditor
            key={p.id}
            project={p}
            onSave={(patch) => run(() => api(`/api/work/projects/${p.id}`, { method: "PATCH", body: patch }))}
            onDelete={() => void remove(p)}
          />
        ))}
        <NewProject onAdd={(body) => run(() => api("/api/work/projects", { body }))} first={!data.projects.length} />
        <Field label="每天正常工时（小时）" hint="记录没填工时时，按这个时间平均分给当天的项目" className="mt-2">
          <Input
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            onBlur={() => {
              const n = Number(hours);
              if (n > 0 && n <= 24 && n !== data.settings.dailyHours) {
                void run(() => api("/api/work/settings", { method: "PUT", body: { dailyHours: n } }));
              }
            }}
            className="w-32"
          />
        </Field>
      </div>
    </Dialog>
  );
}

const PROJECT_FIELDS: { key: "name" | "code" | "taskName" | "taskCode"; label: string; placeholder: string }[] = [
  { key: "name", label: "项目名称", placeholder: "例如：YE2026KF-智能造价管理系统" },
  { key: "code", label: "项目编号", placeholder: "例如：10260510065" },
  { key: "taskName", label: "任务名称", placeholder: "例如：临时任务" },
  { key: "taskCode", label: "任务编号", placeholder: "例如：LSRW_001" },
];

const PROJECT_GRID = "grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]";

function ProjectFields({
  value,
  onChange,
  onBlur,
}: {
  value: Record<string, string>;
  onChange: (key: string, v: string) => void;
  onBlur?: () => void;
}) {
  return (
    <div className={PROJECT_GRID}>
      {PROJECT_FIELDS.map((f) => (
        <Input
          key={f.key}
          aria-label={f.label}
          placeholder={f.key === "name" ? f.placeholder : f.label}
          title={f.placeholder}
          value={value[f.key] ?? ""}
          onChange={(e) => onChange(f.key, e.target.value)}
          onBlur={onBlur}
        />
      ))}
    </div>
  );
}

function ProjectEditor({
  project,
  onSave,
  onDelete,
}: {
  project: WorkProject;
  onSave: (patch: Partial<WorkProject>) => Promise<void>;
  onDelete: () => void;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(
    () => setV({ name: project.name, code: project.code, taskName: project.taskName, taskCode: project.taskCode }),
    [project],
  );
  const save = () => {
    const patch = Object.fromEntries(
      PROJECT_FIELDS.map((f) => [f.key, (v[f.key] ?? "").trim()]).filter(
        ([k, x]) => x !== project[k as keyof WorkProject],
      ),
    );
    if (patch.name === "") return setV((s) => ({ ...s, name: project.name }));
    if (Object.keys(patch).length) void onSave(patch);
  };
  return (
    <div className={cx("flex items-center gap-2", project.archived && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <ProjectFields value={v} onChange={(k, x) => setV((s) => ({ ...s, [k]: x }))} onBlur={save} />
      </div>
      <Button size="sm" variant="ghost" onClick={() => void onSave({ archived: !project.archived })}>
        {project.archived ? "启用" : "停用"}
      </Button>
      <IconButton label="删除项目" size="sm" onClick={onDelete}>
        <Trash2 size={15} />
      </IconButton>
    </div>
  );
}

function NewProject({ onAdd, first }: { onAdd: (body: object) => Promise<void>; first: boolean }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const add = async () => {
    if (!v.name?.trim()) return;
    setBusy(true);
    await onAdd({ name: v.name.trim(), code: v.code ?? "", taskName: v.taskName ?? "", taskCode: v.taskCode ?? "" });
    setBusy(false);
    setV({});
    ref.current?.querySelector("input")?.focus();
  };
  return (
    <div
      ref={ref}
      className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong p-2"
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) void add();
      }}
    >
      <div className="min-w-0 flex-1">
        <ProjectFields value={v} onChange={(k, x) => setV((s) => ({ ...s, [k]: x }))} />
      </div>
      <Button size="sm" variant={first ? "primary" : "secondary"} onClick={() => void add()} disabled={!v.name?.trim()}>
        {busy ? <Spinner size={14} /> : <Plus size={14} />}
        添加
      </Button>
    </div>
  );
}

/* ---------- 下班提醒 ---------- */

const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: "日一二三四五六"[d] }));

function RemindDialog({
  open,
  onClose,
  data,
  run,
}: {
  open: boolean;
  onClose: () => void;
  data: WorkData;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const ui = useUI();
  const s = data.settings;
  const [testing, setTesting] = useState<Kind | null>(null);
  const save = (patch: Partial<WorkData["settings"]>) =>
    run(() => api("/api/work/settings", { method: "PUT", body: patch }));

  const test = async (kind: Kind) => {
    setTesting(kind);
    try {
      await api("/api/work/remind", { body: { kind } });
      ui.toast("已发送，去微信、钉钉看看");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
    setTesting(null);
  };

  const timeInput = (label: string, value: string, key: "remindTime" | "weeklyTime", disabled: boolean) => (
    <Input
      type="time"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => e.target.value && void save({ [key]: e.target.value })}
      className="w-32 tabular-nums"
    />
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="下班提醒"
      description="到点推送到微信、钉钉，提醒写日报、交周报。消息里带上整理好的内容，在手机上就能直接复制。"
      footer={<Button onClick={onClose}>完成</Button>}
    >
      <div className="flex flex-col gap-5">
        {!data.remind.pushReady && (
          <Banner
            tone="warn"
            action={
              <NextLink href="/settings#notify" onClick={onClose}>
                去设置
              </NextLink>
            }
          >
            还没有设置推送方式，先在「设置 › 提醒推送」里填好企业微信、钉钉或飞书机器人
          </Banner>
        )}

        <section className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <Checkbox checked={s.remindDaily} onChange={(e) => void save({ remindDaily: e.target.checked })} />
            每天提醒写日报
          </label>
          <div className={cx("flex flex-wrap items-center gap-3 pl-6", !s.remindDaily && "opacity-50")}>
            {timeInput("日报提醒时间", s.remindTime, "remindTime", !s.remindDaily)}
            <div role="group" aria-label="哪几天提醒" className="flex gap-1">
              {WEEKDAY_OPTIONS.map((d) => {
                const on = s.remindDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={on}
                    aria-label={`周${d.label}`}
                    disabled={!s.remindDaily}
                    onClick={() =>
                      void save({
                        remindDays: on ? s.remindDays.filter((x) => x !== d.value) : [...s.remindDays, d.value],
                      })
                    }
                    className={cx(
                      "size-8 cursor-pointer rounded-full border text-[13px] transition-colors disabled:cursor-not-allowed",
                      on
                        ? "border-accent bg-accent-soft text-accent-text"
                        : "border-control text-muted hover:border-accent/60",
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <Button
              size="sm"
              variant="ghost"
              loading={testing === "daily"}
              disabled={!data.remind.pushReady}
              onClick={() => void test("daily")}
            >
              发一条试试
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <Checkbox checked={s.remindWeekly} onChange={(e) => void save({ remindWeekly: e.target.checked })} />
            每周提醒交周报
          </label>
          <div className={cx("flex flex-wrap items-center gap-3 pl-6", !s.remindWeekly && "opacity-50")}>
            <Select
              aria-label="周几提醒"
              value={s.weeklyDay}
              disabled={!s.remindWeekly}
              onChange={(e) => void save({ weeklyDay: Number(e.target.value) })}
              className="w-24"
            >
              {WEEKDAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  周{d.label}
                </option>
              ))}
            </Select>
            {timeInput("周报提醒时间", s.weeklyTime, "weeklyTime", !s.remindWeekly)}
            <Button
              size="sm"
              variant="ghost"
              loading={testing === "weekly"}
              disabled={!data.remind.pushReady}
              onClick={() => void test("weekly")}
            >
              发一条试试
            </Button>
          </div>
        </section>

        <label className="flex cursor-pointer items-start gap-2 border-t border-line pt-4">
          <Checkbox
            checked={s.remindWithReport}
            onChange={(e) => void save({ remindWithReport: e.target.checked })}
            className="mt-[3px]"
          />
          <span>
            消息里带上整理好的日报、周报
            <span className="block text-[13px] text-muted">没有记录时会提醒你先补几条；关掉后只发一句提醒</span>
          </span>
        </label>
        <LastResult label="最近一次提醒" result={data.remind.last} />
      </div>
    </Dialog>
  );
}
