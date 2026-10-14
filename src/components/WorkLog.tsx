"use client";

import {
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Copy,
  CornerDownRight,
  Bell,
  CalendarDays,
  List,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  FolderCog,
  NotebookPen,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { api, readLocal, writeLocal } from "@/lib/client";
import { localDate } from "@/lib/format";
import { toggleTask } from "@/lib/md-edit";
import { refToken } from "@/lib/refs";
import { readWorkFilters, type WorkFilters } from "@/lib/views";
import {
  buildDaily,
  buildWeekly,
  currentPeriod,
  dailyText,
  HEALTH,
  isoWeek,
  latestUpdate,
  shiftDate,
  splitEntries,
  weekdayLabel,
  weekStart,
  type DailyReport,
  type Period,
  type ProjectUpdate,
  type WorkData,
  type WorkLog,
  type WorkProject,
} from "@/lib/worklog";
import { Markdown } from "./Markdown";
import { clearDraft, MarkdownEditor } from "./MarkdownEditor";
import { LastResult } from "./settings-ui";
import {
  CopyCell,
  refreshWork,
  ReportCard,
  StatusBadge,
  SubmitButton,
  useCopy,
  useSubmit,
  WorkModuleSwitch,
} from "./work-ui";
import { WeeklyEditor } from "./WeeklyEditor";
import { WorkCalendar } from "./WorkCalendar";
import { WorkDailyList } from "./WorkDailyList";
import { WorkHistory } from "./WorkHistory";
import { DayPlanCard, PlanDialog, ShutdownDialog } from "./WorkPlan";
import { HealthDot, ProjectStatusCard } from "./WorkProjectStatus";
import { BacklinkToggle } from "./Backlinks";
import {
  Banner,
  Button,
  Checkbox,
  cx,
  Dialog,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Skeleton,
  Spinner,
  Tabs,
  Textarea,
} from "./ui";
import { useUI } from "./ui-context";

type Kind = "daily" | "weekly" | "calendar";

const workKey = (date: string) => `/api/work?date=${weekStart(date)}`;

function useWork(date: string) {
  return useSWR(workKey(date), (url: string) => api<WorkData>(url));
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "am", label: "上午" },
  { value: "pm", label: "下午" },
];

const mmdd = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;

export function WorkView() {
  const ui = useUI();
  const [kind, setKind] = useState<Kind>("daily");
  const [date, setDate] = useState(() => localDate());
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [dailyView, setDailyView] = useState<"day" | "list">("day");
  // 专注记录：隐藏右边的日报，只留输入框和记录
  const [focus, setFocus] = useState(false);
  // 记一笔时让输入框获得焦点（每次加一）
  const [captureKey, setCaptureKey] = useState(0);
  const [planOpen, setPlanOpen] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  // 地址参数：?date=2026-10-12 打开那一天的日报（从搜索结果跳过来）；
  // ?do=capture / plan / shutdown / today / weekly / calendar 是命令面板、快捷键、下班提醒发来的操作。处理完去掉参数
  const params = useSearchParams();
  const router = useRouter();
  const dateParam = params.get("date");
  const doParam = params.get("do");
  // 从引用跳过来：?date=2026-10-12&log=12 高亮那一条
  const logParam = params.get("log");
  const [highlight, setHighlight] = useState<number | null>(null);
  // 接着做：把内容和引用填进输入框
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  // 打开保存的视图：周报列表的筛选条件
  const [historyFilter, setHistoryFilter] = useState<(WorkFilters & { key: number }) | undefined>();
  useEffect(() => {
    const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
    if (day && logParam) {
      setHighlight(Number(logParam));
      setTimeout(() => setHighlight(null), 2500);
      router.replace(`/work?date=${day}`, { scroll: false });
    }
    if (!day && !doParam) return;
    setDate(day ?? localDate());
    if (doParam === "weekly" || doParam === "calendar") {
      setKind(doParam);
    } else {
      setKind("daily");
      setDailyView("day");
    }
    if (doParam === "capture") setCaptureKey((k) => k + 1);
    const filters = doParam === "weekly" ? readWorkFilters(params) : null;
    if (filters) setHistoryFilter({ ...filters, key: Date.now() });
    if (doParam === "plan") setPlanOpen(true);
    if (doParam === "shutdown") setShutdownOpen(true);
    if (doParam) router.replace(day ? `/work?date=${day}` : "/work", { scroll: false });
  }, [dateParam, doParam, logParam]);
  const { data, mutate } = useWork(date);
  const today = localDate();
  // 高亮的那条加载出来后滚到中间
  useEffect(() => {
    if (highlight === null) return;
    requestAnimationFrame(() =>
      document.getElementById(`log-${highlight}`)?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }, [highlight, !!data]);

  useEffect(() => {
    setFocus(readLocal("mydoc.workFocus", false));
    // 从搜索结果跳过来、或者带着要做的操作时，不恢复上次的标签页
    if (window.location.search) return;
    const saved = readLocal<Kind>("mydoc.workTab", "daily");
    if (saved === "weekly" || saved === "calendar") setKind(saved);
    if (readLocal<string>("mydoc.workDailyView", "day") === "list") setDailyView("list");
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await Promise.all([mutate(), refreshWork()]);
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const openDay = (d: string) => {
    setDate(d);
    setKind("daily");
    setDailyView("day");
    window.scrollTo({ top: 0 });
  };

  const step = kind === "daily" ? 1 : 7;
  const isCurrent = kind === "daily" ? date === today : weekStart(date) === weekStart(today);
  const daily = useMemo(() => (data ? buildDaily(data, date) : null), [data, date]);
  const weekly = useMemo(() => (data ? buildWeekly(data, date) : null), [data, date]);

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pt-4 pb-12 md:px-8 md:pt-6">
      <WorkModuleSwitch current="work" />
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
        <div className="flex shrink-0 gap-1 md:hidden">
          <IconButton label="下班提醒" onClick={() => setRemindOpen(true)}>
            <Bell size={18} />
          </IconButton>
          <IconButton label="报工项目" onClick={() => setProjectsOpen(true)}>
            <FolderCog size={18} />
          </IconButton>
        </div>
        <div className="flex shrink-0 gap-2 max-md:hidden">
          <Button onClick={() => setRemindOpen(true)}>
            <Bell size={16} />
            {data?.settings.remindDaily ? `每天 ${data.settings.remindTime} 提醒` : "工作提醒"}
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
            { value: "calendar", label: "日历" },
          ]}
        />
        {kind === "daily" && (
          <Segmented
            label="日报显示方式"
            value={dailyView}
            onChange={(v) => {
              setDailyView(v);
              writeLocal("mydoc.workDailyView", v);
            }}
            options={[
              { value: "day", label: "单日", icon: <CalendarDays size={15} /> },
              { value: "list", label: "列表", icon: <List size={15} /> },
            ]}
            className="mb-1.5 md:ml-2"
          />
        )}
        {kind === "daily" && dailyView === "day" && (
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={focus}
            title={focus ? "显示右边的日报" : "隐藏日报，专心记录"}
            onClick={() => {
              setFocus(!focus);
              writeLocal("mydoc.workFocus", !focus);
            }}
            className={cx("mb-1.5", focus && "bg-accent-soft text-accent-text")}
          >
            {focus ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
            {focus ? "显示日报" : "专注记录"}
          </Button>
        )}
        <span className="flex-1 max-md:hidden" />
        {kind !== "calendar" && !(kind === "daily" && dailyView === "list") && (
          <div className="flex items-center gap-1 pb-1.5 max-md:w-full max-md:justify-between">
            <IconButton label={kind === "daily" ? "前一天" : "上一周"} onClick={() => setDate(shiftDate(date, -step))}>
              <ChevronLeft size={18} />
            </IconButton>
            <span className="text-center text-[15px] font-medium tabular-nums max-md:min-w-0 max-md:flex-1 md:min-w-[230px]">
              {kind === "daily"
                ? `${mmdd(date)} ${weekdayLabel(date)} · 第 ${isoWeek(date)} 周`
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
          </div>
        )}
      </div>

      {kind === "daily" && dailyView === "list" ? (
        <WorkDailyList today={today} onOpenDay={openDay} />
      ) : kind === "calendar" ? (
        <WorkCalendar
          today={today}
          onOpenDay={openDay}
          onOpenWeek={(d) => {
            setDate(d);
            setKind("weekly");
            window.scrollTo({ top: 0 });
          }}
        />
      ) : !data || !daily || !weekly ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : (
        <div
          className={cx(
            "grid items-start gap-5",
            kind === "daily" && focus ? "mx-auto w-full max-w-[760px]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
          )}
        >
          {kind === "daily" ? (
            <div className="flex min-w-0 flex-col gap-4">
              <DayPlanCard
                date={date}
                today={today}
                data={data}
                onPlan={() => setPlanOpen(true)}
                onShutdown={() => setShutdownOpen(true)}
              />
              <Composer
                data={data}
                date={date}
                focusKey={captureKey}
                prefill={prefill}
                onAdd={async (body) => {
                  let ok = false;
                  await run(async () => {
                    await api("/api/work/logs", { body });
                    ok = true;
                  });
                  return ok;
                }}
                onManageProjects={() => setProjectsOpen(true)}
              />
              <LogList
                data={data}
                kind={kind}
                date={date}
                run={run}
                mutate={mutate}
                highlight={highlight}
                onContinue={(l) => {
                  setDate(today);
                  setPrefill({
                    key: Date.now(),
                    text: `继续${l.content.replace(/^继续[：:]?/, "")}`,
                    detail: `接着 ${refToken("log", l.id, l.content)}\n`,
                    projectId: l.projectId,
                  });
                }}
              />
            </div>
          ) : (
            <WorkHistory
              selected={weekStart(date)}
              today={today}
              onSelectWeek={setDate}
              onOpenDay={openDay}
              initial={historyFilter}
            />
          )}
          {kind === "daily" ? (
            !focus && <DailyCard report={daily} date={date} run={run} />
          ) : (
            <div className="flex min-w-0 flex-col gap-5">
              <WeeklyEditor data={data} date={date} onSaved={() => void Promise.all([mutate(), refreshWork()])} />
              <ProjectStatusCard data={data} date={date} onSaved={() => void Promise.all([mutate(), refreshWork()])} />
            </div>
          )}
        </div>
      )}

      {data && <ProjectsDialog open={projectsOpen} onClose={() => setProjectsOpen(false)} data={data} run={run} />}
      {data && <RemindDialog open={remindOpen} onClose={() => setRemindOpen(false)} data={data} run={run} />}
      {data && <PlanDialog open={planOpen} onClose={() => setPlanOpen(false)} date={date} today={today} data={data} />}
      {data && (
        <ShutdownDialog open={shutdownOpen} onClose={() => setShutdownOpen(false)} date={date} data={data} run={run} />
      )}
    </div>
  );
}

/* ---------- 记一笔 ---------- */

const DETAIL_DRAFT = "work-detail";

interface Prefill {
  key: number;
  text: string;
  detail: string;
  projectId: number | null;
}

function Composer({
  data,
  date,
  focusKey,
  prefill,
  onAdd,
  onManageProjects,
}: {
  data: WorkData;
  date: string;
  /** 变了就让输入框获得焦点（快捷键 C、命令面板的「记一笔」） */
  focusKey: number;
  /** 接着做：填好内容和关联 */
  prefill: Prefill | null;
  onAdd: (body: object) => Promise<boolean>;
  onManageProjects: () => void;
}) {
  const [text, setText] = useState("");
  const [detail, setDetail] = useState("");
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
  // 明细只能跟着一条工作内容
  const tooMany = !!detail.trim() && entries.length > 1;
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focusKey) return;
    titleRef.current?.focus();
    titleRef.current?.scrollIntoView({ block: "center" });
  }, [focusKey]);
  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text);
    setDetail(prefill.detail);
    if (prefill.projectId !== null && projects.some((p) => p.id === prefill.projectId)) setProjectId(prefill.projectId);
    const el = titleRef.current;
    el?.scrollIntoView({ block: "center" });
    el?.focus();
    el?.setSelectionRange(prefill.text.length, prefill.text.length);
  }, [prefill?.key]);

  // 工作内容框跟着内容变高
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const submit = async () => {
    if (!entries.length || tooMany || busy) return;
    setBusy(true);
    try {
      // 没加上时保留输入的内容
      if (!(await onAdd({ date, period, projectId: current, contents: entries, detail }))) return;
      setText("");
      setDetail("");
      clearDraft(DETAIL_DRAFT);
      titleRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="记一笔" className="rounded-xl border border-line bg-surface px-4 pt-3.5 pb-3">
      <Textarea
        id="work-input"
        ref={titleRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        aria-label="工作内容"
        placeholder={`${date === localDate() ? "今天" : mmdd(date)}做了什么？一句话，会写进日报（回车添加）`}
        className="min-h-0 resize-none border-0 px-0 py-0 text-[15px] leading-6 font-medium shadow-none hover:border-0 focus:ring-0"
      />
      <MarkdownEditor
        bare
        grow
        rows={4}
        value={detail}
        onChange={setDetail}
        onSubmit={() => void submit()}
        draft={DETAIL_DRAFT}
        aria-label="明细"
        placeholder={
          "补充明细（可选）：过程、原因、改了哪些地方、链接…\n只留在这条记录里，不进日报。支持列表、待办，Ctrl + 回车添加"
        }
        className="mt-2"
      />
      {tooMany && <p className="mt-1 text-xs text-warn-text">写了明细时，一次只能加一条；工作内容里请只写一行</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-3">
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
            + 添加报工项目
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
          disabled={!entries.length || tooMany}
          onClick={() => void submit()}
          title="回车或 Ctrl + 回车添加"
          className="ml-auto"
        >
          {entries.length > 1 && !tooMany ? `添加 ${entries.length} 条` : "添加"}
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
  highlight,
  onContinue,
}: {
  data: WorkData;
  kind: Kind;
  date: string;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  mutate: () => Promise<unknown>;
  /** 从引用跳过来时，高亮这一条 */
  highlight?: number | null;
  /** 接着做：今天新记一条，关联这条 */
  onContinue: (log: WorkLog) => void;
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
                  detail: l.detail,
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
                projects={data.projects}
                showPeriod={kind === "weekly"}
                highlight={highlight === l.id}
                onContinue={() => onContinue(l)}
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
  projects,
  showPeriod,
  highlight,
  onContinue,
  onPatch,
  onDelete,
}: {
  log: WorkLog;
  projects: WorkProject[];
  showPeriod: boolean;
  highlight: boolean;
  onContinue: () => void;
  onPatch: (patch: Partial<WorkLog>) => Promise<void>;
  onDelete: () => void;
}) {
  const project = projects.find((p) => p.id === log.projectId);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(log.content);
  const save = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== log.content) void onPatch({ content: v });
    else setDraft(log.content);
  };
  return (
    <li
      id={`log-${log.id}`}
      className={cx(
        "group/log flex scroll-mt-24 items-start gap-2.5 border-b border-line px-3 py-2.5 transition-colors duration-700 last:border-b-0",
        highlight && "bg-accent-soft",
      )}
    >
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
          <button
            type="button"
            onClick={() => setDialog(true)}
            title="修改项目、时段、工时"
            className="cursor-pointer truncate hover:text-fg hover:underline"
          >
            {project?.name ?? "未选择项目"}
          </button>
          {showPeriod && <span>{log.period === "am" ? "上午" : "下午"}</span>}
          {log.hours !== null && <span>{log.hours} 小时</span>}
          {!log.done && <span className="text-warn-text">未完成</span>}
          {log.source === "mcp" && <span>AI 助手记录</span>}
          {!log.detail.trim() && (
            <button
              type="button"
              onClick={() => setDialog(true)}
              className="cursor-pointer opacity-0 group-hover/log:opacity-100 hover:text-fg hover:underline focus-visible:opacity-100 pointer-coarse:hidden"
            >
              + 补充明细
            </button>
          )}
          <BacklinkToggle type="log" id={log.id} label="关联" />
        </div>
        {log.detail.trim() && (
          <LogDetail
            text={log.detail}
            onToggleTask={(n) => void onPatch({ detail: toggleTask(log.detail, n) })}
            onEdit={() => setDialog(true)}
          />
        )}
      </div>
      <div className="flex shrink-0 opacity-0 group-hover/log:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
        <IconButton label="接着做：今天新记一条，关联这条" size="sm" onClick={onContinue}>
          <CornerDownRight size={15} />
        </IconButton>
        <IconButton label="修改" size="sm" onClick={() => setDialog(true)}>
          <Pencil size={15} />
        </IconButton>
        <IconButton label="删除" size="sm" onClick={onDelete}>
          <Trash2 size={15} />
        </IconButton>
      </div>
      <LogEditDialog
        open={dialog}
        log={log}
        projects={projects}
        onClose={() => setDialog(false)}
        onSave={async (patch) => {
          setDialog(false);
          if (Object.keys(patch).length) await onPatch(patch);
        }}
      />
    </li>
  );
}

/** 记录下面的明细：太长时先收起，点「展开」看全部；待办可以直接打勾 */
function LogDetail({
  text,
  onToggleTask,
  onEdit,
}: {
  text: string;
  onToggleTask: (n: number) => void;
  onEdit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 4);
  }, [text, open]);
  return (
    <div className="mt-1.5 rounded-md border-l-2 border-line-strong bg-field/60 py-1.5 pr-2 pl-3 text-[13px] leading-[1.6]">
      <div
        ref={ref}
        className={cx(
          !open && "max-h-[8.5rem] overflow-hidden",
          long && !open && "[mask-image:linear-gradient(to_bottom,black_65%,transparent)]",
        )}
      >
        <Markdown text={text} onToggleTask={onToggleTask} />
      </div>
      <div className="mt-1 flex gap-3 text-xs text-faint">
        {(long || open) && (
          <button type="button" onClick={() => setOpen(!open)} className="cursor-pointer hover:text-fg">
            {open ? "收起" : "展开全部"}
          </button>
        )}
        <button type="button" onClick={onEdit} className="cursor-pointer hover:text-fg">
          修改明细
        </button>
      </div>
    </div>
  );
}

/** 修改一条记录：内容、明细、项目、日期、上午下午、工时、是否完成 */
function LogEditDialog({
  open,
  log,
  projects,
  onClose,
  onSave,
}: {
  open: boolean;
  log: WorkLog;
  projects: WorkProject[];
  onClose: () => void;
  onSave: (patch: Partial<WorkLog>) => Promise<void>;
}) {
  const [v, setV] = useState(log);
  const [hours, setHours] = useState("");
  // 只在打开时读入；打开期间数据刷新也不覆盖正在改的内容
  useEffect(() => {
    if (!open) return;
    setV(log);
    setHours(log.hours === null ? "" : String(log.hours));
  }, [open]);
  // 停用的项目不再出现在选项里，除非这条记录本来就属于它
  const options = projects.filter((p) => !p.archived || p.id === log.projectId);
  const h = hours.trim() === "" ? null : Number(hours);
  const valid = v.content.trim() && (h === null || (h >= 0 && h <= 24));

  const save = () => {
    if (!valid) return;
    const next: Partial<WorkLog> = {};
    const content = v.content.trim();
    if (content !== log.content) next.content = content;
    const detail = v.detail.trim() ? v.detail : "";
    if (detail !== log.detail) next.detail = detail;
    if (v.projectId !== log.projectId) next.projectId = v.projectId;
    if (v.date !== log.date) next.date = v.date;
    if (v.period !== log.period) next.period = v.period;
    if (h !== log.hours) next.hours = h;
    if (v.done !== log.done) next.done = v.done;
    void onSave(next);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="修改记录"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="工作内容" hint="一句话，会写进日报">
          <Textarea
            rows={2}
            value={v.content}
            onChange={(e) => setV({ ...v, content: e.target.value })}
            className="leading-6"
          />
        </Field>
        <Field label="明细" hint="过程、原因、改了哪些地方、链接…只留在这条记录里，不进日报" as="div">
          <MarkdownEditor
            grow
            rows={6}
            value={v.detail}
            onChange={(detail) => setV({ ...v, detail })}
            onSubmit={save}
            aria-label="明细"
            placeholder="支持列表、待办、加粗、链接，Ctrl + 回车保存"
          />
        </Field>
        <Field label="报工项目">
          <Select
            value={v.projectId ?? ""}
            onChange={(e) => setV({ ...v, projectId: e.target.value ? Number(e.target.value) : null })}
          >
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? "（已停用）" : ""}
              </option>
            ))}
            <option value="">未选择项目</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日期">
            <Input
              type="date"
              value={v.date}
              onChange={(e) => e.target.value && setV({ ...v, date: e.target.value })}
            />
          </Field>
          <Field label="时段" as="div">
            <div role="radiogroup" aria-label="时段" className="flex h-9 rounded-md bg-field p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={v.period === p.value}
                  onClick={() => setV({ ...v, period: p.value })}
                  className={cx(
                    "flex-1 cursor-pointer rounded text-[13px] transition-colors",
                    v.period === p.value
                      ? "bg-surface font-medium text-fg shadow-[0_1px_2px_var(--shadow)] dark:bg-chip"
                      : "text-muted hover:text-fg",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="工时（小时）" hint="不填时按每天的正常工时平均分">
          <Input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={hours}
            placeholder="自动"
            onChange={(e) => setHours(e.target.value)}
            className="w-32"
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={v.done} onChange={(e) => setV({ ...v, done: e.target.checked })} />
          已完成
          <span className="text-xs text-faint">没完成的会放进下周计划的建议里</span>
        </label>
      </div>
    </Dialog>
  );
}

/* ---------- 日报、周报 ---------- */

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
      {/* 要原样粘贴到公司系统，不用 Markdown 格式；回车会自动接着编号 */}
      <MarkdownEditor
        id={id}
        markdown={false}
        rows={Math.min(10, Math.max(3, draft.split("\n").length + 1))}
        value={draft}
        placeholder={`添加记录后自动生成${label}`}
        onChange={setDraft}
        onBlur={() => {
          if (draft !== value) void onSave(draft === auto ? null : draft);
        }}
      />
    </div>
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
  const submit = useSubmit();
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
          <SubmitButton
            submitted={!!r.submittedAt}
            busy={submit.busy}
            disabled={!r.logCount}
            onToggle={(on) => void submit.set("daily", date, on, "日报")}
          />
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
              <CopyCell label="任务状态" value={row.status} />
              <CopyCell label="工时(小时)" value={row.hours} mono />
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
      size="md"
      title="报工项目"
      description="你在哪些项目上工作，记录时选一下，日报、周报就会按项目整理。和收藏链接的项目互不影响。"
      footer={<Button onClick={onClose}>完成</Button>}
    >
      <div className="flex flex-col gap-3">
        {data.projects.map((p) => (
          <ProjectEditor
            key={p.id}
            project={p}
            latest={latestUpdate(data, p.id)}
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

// 只维护项目名称；数据库里的编号字段保留，以后需要时再放出来
const PROJECT_FIELDS: { key: "name"; label: string; placeholder: string }[] = [
  { key: "name", label: "项目名称", placeholder: "项目名称，例如：智能造价管理系统" },
];

const PROJECT_GRID = "grid";

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
          placeholder={f.placeholder}
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
  latest,
  onSave,
  onDelete,
}: {
  project: WorkProject;
  /** 最近一次的项目进展，用来显示状态 */
  latest?: ProjectUpdate;
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
      <span
        className="flex w-4 shrink-0 justify-center"
        title={
          latest
            ? `第 ${isoWeek(latest.week)} 周：${HEALTH[latest.health]}${latest.note ? ` · ${latest.note}` : ""}`
            : "还没写过进展"
        }
      >
        {latest ? (
          <HealthDot health={latest.health} />
        ) : (
          <span className="size-2 rounded-full border border-line-strong" />
        )}
      </span>
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
    await onAdd({ name: v.name.trim() });
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
  const [testing, setTesting] = useState<"daily" | "weekly" | "digest" | null>(null);
  const save = (patch: Partial<WorkData["settings"]>) =>
    run(() => api("/api/work/settings", { method: "PUT", body: patch }));

  const test = async (kind: "daily" | "weekly" | "digest") => {
    setTesting(kind);
    try {
      await api("/api/work/remind", { body: { kind } });
      ui.toast("已发送，去微信、钉钉看看");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
    setTesting(null);
  };

  const timeInput = (
    label: string,
    value: string,
    key: "remindTime" | "weeklyTime" | "digestTime",
    disabled: boolean,
  ) => (
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
      title="工作提醒"
      description="到点推送到微信、钉钉：下班提醒写日报、交周报，消息里带上整理好的内容，在手机上就能直接复制；每周开工时推送上周回顾和本周计划。"
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

        <section className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <Checkbox checked={s.remindDigest} onChange={(e) => void save({ remindDigest: e.target.checked })} />
            每周开工提醒
          </label>
          <p className="-mt-1.5 pl-6 text-xs text-faint">
            每周第一个工作日（周一放假就顺延）早上推送：上周做了什么、还有什么没收尾、本周计划、有风险的项目，点开直接安排今天的计划
          </p>
          <div className={cx("flex flex-wrap items-center gap-3 pl-6", !s.remindDigest && "opacity-50")}>
            {timeInput("开工提醒时间", s.digestTime, "digestTime", !s.remindDigest)}
            <Button
              size="sm"
              variant="ghost"
              loading={testing === "digest"}
              disabled={!data.remind.pushReady}
              onClick={() => void test("digest")}
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
