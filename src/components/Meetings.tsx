"use client";

import {
  ArrowLeft,
  Bell,
  BookmarkPlus,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Copy,
  FileText,
  History,
  ListTodo,
  NotebookPen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { api, readLocal, useAppData, writeLocal } from "@/lib/client";
import { localDate } from "@/lib/format";
import { toggleTask } from "@/lib/md-edit";
import {
  appendToSection,
  isBlankNotes,
  isTaskSection,
  MEETING_TEMPLATES,
  meetingMarkdown,
  meetingText,
  openTasksFrom,
  parseTaskMeta,
  parseTasks,
  previousMeeting,
  sectionsOf,
  splitSentences,
  tidyNotes,
  toTemplate,
  type Meeting,
  type MeetingTemplate,
} from "@/lib/meetings";
import { currentPeriod, weekdayLabel } from "@/lib/worklog";
import { refKey } from "@/lib/refs";
import { BacklinkList, useBacklinks } from "./Backlinks";
import { Markdown } from "./Markdown";
import { clearDraft, MarkdownEditor } from "./MarkdownEditor";
import {
  Button,
  cx,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  SearchField,
  Select,
  Skeleton,
  Textarea,
} from "./ui";
import { useUI } from "./ui-context";
import { useWorkAll } from "./WorkCalendar";
import { useDayPlan } from "./WorkPlan";
import { NEW_MEETING_EVENT, refreshWork, useCopy, WorkModuleSwitch } from "./work-ui";

const KEY = "/api/meetings";
const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;

type Mode = { kind: "view"; id: number } | { kind: "edit"; id: number | null } | { kind: "none" };

/** 会议纪要页：和工作记录、收藏并列的独立模块 */
export function MeetingsView() {
  const [today] = useState(() => localDate());
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pt-4 pb-12 md:px-8 md:pt-6">
      <WorkModuleSwitch current="meetings" />
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-[#E8488B] text-white md:size-12"
        >
          <Users size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="hidden text-xl leading-7 font-semibold md:block">会议纪要</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            粘贴会议文字稿，挑出要点和待办；待办可以打勾，也能一键变成工作记录或提醒
          </p>
        </div>
      </div>
      <MeetingsBody today={today} />
    </div>
  );
}

function MeetingsBody({ today }: { today: string }) {
  const ui = useUI();
  const { data: meetings, mutate } = useSWR(KEY, (url: string) => api<Meeting[]>(url));
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "none" });

  useEffect(() => {
    const open = () => setMode({ kind: "edit", id: null });
    window.addEventListener(NEW_MEETING_EVENT, open);
    return () => window.removeEventListener(NEW_MEETING_EVENT, open);
  }, []);

  // 命令面板的「新建会议纪要」：/meetings?do=new
  const router = useRouter();
  // 从引用跳过来：/meetings?id=5 打开那一条
  const params = useSearchParams();
  const doParam = params.get("do");
  const idParam = params.get("id");
  useEffect(() => {
    if (doParam !== "new" && !idParam) return;
    setMode(doParam === "new" ? { kind: "edit", id: null } : { kind: "view", id: Number(idParam) });
    router.replace("/meetings", { scroll: false });
  }, [doParam, idParam]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (meetings ?? []).filter((m) =>
      words.every((w) => `${m.title}\n${m.attendees}\n${m.notes}`.toLowerCase().includes(w)),
    );
  }, [meetings, q]);

  if (!meetings) return <Skeleton className="h-96 rounded-xl" />;

  // 没选中时，电脑上默认显示第一条
  const selectedId = mode.kind === "view" ? mode.id : mode.kind === "edit" ? mode.id : (shown[0]?.id ?? null);
  const selected = meetings.find((m) => m.id === selectedId);
  // 手机上一次只显示列表或详情
  const showingDetail = mode.kind !== "none";

  const remove = async (m: Meeting) => {
    try {
      await api(`/api/meetings/${m.id}`, { method: "DELETE" });
      await mutate();
      setMode({ kind: "none" });
      ui.toast("已删除会议纪要", {
        action: {
          label: "撤销",
          onClick: async () => {
            const { id: _id, createdAt: _c, updatedAt: _u, ...body } = m;
            const back = await api<Meeting>(KEY, { body });
            await mutate();
            setMode({ kind: "view", id: back.id });
          },
        },
      });
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className={cx("flex min-w-0 flex-col gap-3", showingDetail && "max-lg:hidden")}>
        <div className="flex items-center gap-2">
          <SearchField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索会议纪要"
            aria-label="搜索会议纪要"
            className="min-w-0 flex-1"
          />
          <Button variant="primary" onClick={() => setMode({ kind: "edit", id: null })}>
            <Plus size={16} />
            新建纪要
          </Button>
        </div>
        {meetings.length === 0 ? (
          <EmptyState
            illustration={null}
            icon={<Users size={40} strokeWidth={1.5} />}
            title="还没有会议纪要"
            tip="钉钉会议的「闪记」、微信里的讨论都可以复制过来"
          >
            把会议文字稿粘贴进来，挑出要点和待办；待办可以打勾，也能一键变成工作记录或提醒
          </EmptyState>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-faint">没有找到相关的会议纪要</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((m) => {
              const tasks = parseTasks(m.notes);
              const done = tasks.filter((t) => t.done).length;
              const active = m.id === selectedId && mode.kind !== "edit";
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setMode({ kind: "view", id: m.id })}
                    aria-current={active ? "true" : undefined}
                    className={cx(
                      "flex w-full cursor-pointer flex-col gap-1 rounded-xl border p-3.5 text-left transition-colors",
                      active ? "border-accent bg-accent-soft/40" : "border-line bg-surface hover:border-line-strong",
                    )}
                  >
                    <span className="truncate font-medium">{m.title}</span>
                    <span className="flex items-center gap-2 text-xs text-faint">
                      <span className="tabular-nums">
                        {md(m.date)} {weekdayLabel(m.date)}
                      </span>
                      {tasks.length > 0 && (
                        <span
                          className={cx(
                            "rounded px-1.5 leading-5",
                            done === tasks.length ? "bg-success-soft text-success-text" : "bg-warn-soft text-warn-text",
                          )}
                        >
                          待办 {done}/{tasks.length}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={cx("min-w-0", !showingDetail && "max-lg:hidden")}>
        {mode.kind === "edit" ? (
          <MeetingEditor
            key={mode.id ?? "new"}
            meeting={mode.id === null ? undefined : selected}
            meetings={meetings}
            today={today}
            onCancel={() => setMode(mode.id === null ? { kind: "none" } : { kind: "view", id: mode.id })}
            onSaved={async (m) => {
              await mutate();
              setMode({ kind: "view", id: m.id });
            }}
          />
        ) : selected ? (
          <MeetingView
            meeting={selected}
            today={today}
            onBack={() => setMode({ kind: "none" })}
            onEdit={() => setMode({ kind: "edit", id: selected.id })}
            onDelete={() => void remove(selected)}
            onChanged={() => void mutate()}
          />
        ) : (
          meetings.length > 0 && (
            <p className="rounded-xl border border-dashed border-line-strong py-16 text-center text-[13px] text-faint">
              选择左边的会议查看纪要
            </p>
          )
        )}
      </div>
    </div>
  );
}

/* ---------- 查看 ---------- */

/** 截止日期：今天、明天、10月17日 周五 */
function dueLabel(due: string, today: string): string {
  if (due === today) return "今天";
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  if (due === d.toISOString().slice(0, 10)) return "明天";
  return `${md(due)} ${weekdayLabel(due)}`;
}

function MeetingView({
  meeting: m,
  today,
  onBack,
  onEdit,
  onDelete,
  onChanged,
}: {
  meeting: Meeting;
  today: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const ui = useUI();
  const copy = useCopy();
  const { data: work } = useWorkAll();
  const { data: app } = useAppData();
  const { data: plan } = useDayPlan(today);
  const project = work?.projects.find((p) => p.id === m.projectId);
  const tasks = parseTasks(m.notes).filter((t) => t.text);

  const patch = async (body: Partial<Meeting>) => {
    try {
      await api(`/api/meetings/${m.id}`, { method: "PATCH", body });
      onChanged();
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const toWorkLog = async (text: string, done: boolean) => {
    try {
      await api("/api/work/logs", {
        body: { date: today, period: currentPeriod(), projectId: m.projectId, contents: [text], done },
      });
      await refreshWork();
      ui.toast(done ? "已加入今天的工作记录" : "已加入今天的工作记录（未完成，会出现在下周计划的建议里）");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const toPlan = async (text: string) => {
    try {
      await api("/api/work/plan", {
        body: { date: today, op: "add", items: [{ text, projectId: m.projectId, source: "meeting" }] },
      });
      await refreshWork();
      ui.toast("已加入今天的计划");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  return (
    <article className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <IconButton label="返回列表" onClick={onBack} className="-ml-1 lg:hidden">
          <ArrowLeft size={18} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-7 font-semibold break-words">{m.title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {[`${md(m.date)} ${weekdayLabel(m.date)}`, project?.name, m.attendees && `参会：${m.attendees}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
          <span className="flex">
            <Button
              size="sm"
              className="rounded-r-none"
              title="编号的纯文字，直接发到微信、钉钉群里"
              onClick={() => void copy("会议纪要", meetingText(m, project?.name))}
            >
              <Copy size={14} />
              复制纪要
            </Button>
            <Menu
              label="更多复制方式"
              items={[
                {
                  label: "复制为纯文字（微信、钉钉）",
                  icon: <Copy size={15} />,
                  onSelect: () => void copy("会议纪要", meetingText(m, project?.name)),
                },
                {
                  label: "复制为 Markdown（语雀、飞书文档）",
                  icon: <FileText size={15} />,
                  onSelect: () => void copy("Markdown", meetingMarkdown(m, project?.name)),
                },
              ]}
              trigger={(props) => (
                <Button {...props} size="sm" aria-label="更多复制方式" className="-ml-px rounded-l-none px-1.5">
                  <ChevronDown size={14} />
                </Button>
              )}
            />
          </span>
          <IconButton label="编辑" size="sm" onClick={onEdit}>
            <Pencil size={15} />
          </IconButton>
          <IconButton label="删除" size="sm" onClick={onDelete}>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>

      {m.notes.trim() ? (
        <Markdown text={m.notes} onToggleTask={(n) => void patch({ notes: toggleTask(m.notes, n) })} />
      ) : (
        <p className="text-[13px] text-faint">还没有写纪要，点右上角的编辑按钮开始整理</p>
      )}

      {tasks.length > 0 && (
        <section aria-label="待办跟进" className="rounded-lg border border-line">
          <h3 className="border-b border-line px-4 py-2 text-[13px] font-medium">
            待办跟进
            <span className="ml-2 font-normal text-faint">
              写上「@张三」「周五前」，会认出负责人和截止日期，建提醒时自动填好
            </span>
          </h3>
          <ul>
            {tasks.map((t) => {
              const { owner, due } = parseTaskMeta(t.text, m.date, m.attendees);
              const overdue = !t.done && !!due && due < today;
              const inWork = work?.logs.some((l) => l.content === t.text);
              const inPlan = plan?.items.some((i) => i.text === t.text);
              const inReminder = app?.reminders.some((r) => r.title === t.text);
              return (
                <li
                  key={t.index}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2 last:border-b-0"
                >
                  <span className="flex min-w-[12rem] flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    <span className={cx(t.done && "text-muted line-through")}>{t.text}</span>
                    {owner && (
                      <span className="inline-flex items-center gap-1 rounded bg-chip px-1.5 text-xs leading-5 text-muted">
                        <UserRound size={12} />
                        {owner}
                      </span>
                    )}
                    {due && (
                      <span
                        className={cx(
                          "inline-flex items-center gap-1 rounded px-1.5 text-xs leading-5",
                          t.done
                            ? "bg-chip text-faint"
                            : overdue
                              ? "bg-danger-soft text-danger-text"
                              : due <= today
                                ? "bg-warn-soft text-warn-text"
                                : "bg-chip text-muted",
                        )}
                      >
                        <CalendarClock size={12} />
                        {overdue ? `已过期 · ${md(due)}` : `${dueLabel(due, today)}截止`}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-1 text-xs">
                    {!t.done &&
                      (inPlan ? (
                        <span className="flex items-center gap-1 px-2 text-success-text">
                          <CircleCheck size={13} />
                          在今天计划里
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => void toPlan(t.text)}>
                          <ListTodo size={14} />
                          加入计划
                        </Button>
                      ))}
                    {inWork ? (
                      <span className="flex items-center gap-1 px-2 text-success-text">
                        <CircleCheck size={13} />
                        已在工作记录
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => void toWorkLog(t.text, t.done)}>
                        <NotebookPen size={14} />
                        加入工作记录
                      </Button>
                    )}
                    {inReminder ? (
                      <span className="flex items-center gap-1 px-2 text-success-text">
                        <CircleCheck size={13} />
                        已建提醒
                      </span>
                    ) : (
                      !t.done && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            ui.editReminder(undefined, {
                              title: t.text,
                              note: `来自会议「${m.title}」（${m.date}）${owner ? `，负责人：${owner}` : ""}`,
                              dueDate: due,
                              once: true,
                            })
                          }
                        >
                          <Bell size={14} />
                          建提醒
                        </Button>
                      )
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <MeetingBacklinks id={m.id} />

      {m.source.trim() && (
        <details className="group rounded-lg border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-[13px] [&::-webkit-details-marker]:hidden">
            <ChevronRight size={14} className="text-muted transition-transform group-open:rotate-90" />
            <span className="font-medium">会议原文</span>
            <span className="text-faint">{m.source.length} 字</span>
          </summary>
          <div className="max-h-96 overflow-y-auto border-t border-line px-4 py-3 text-[13px] leading-6 whitespace-pre-wrap text-muted">
            {m.source}
          </div>
        </details>
      )}
    </article>
  );
}

/* ---------- 新建、编辑 ---------- */

const TEMPLATE_KEY = "mydoc.meetingTemplate";
const SOURCE_KEY = "mydoc.meetingSource";
const TEMPLATES = "/api/meetings/templates";
const stripEnd = (s: string) => s.replace(/[。！？!?；;]$/, "");

function MeetingEditor({
  meeting,
  meetings,
  today,
  onCancel,
  onSaved,
}: {
  meeting?: Meeting;
  meetings: Meeting[];
  today: string;
  onCancel: () => void;
  onSaved: (m: Meeting) => void;
}) {
  const ui = useUI();
  const { data: work } = useWorkAll();
  const { data: custom, mutate: mutateTemplates } = useSWR(TEMPLATES, (url: string) => api<MeetingTemplate[]>(url));
  const templates = [...MEETING_TEMPLATES, ...(custom ?? [])];
  // 新建时用上次选的模板
  const [templateId, setTemplateId] = useState<string | null>(() =>
    meeting ? null : readLocal(TEMPLATE_KEY, MEETING_TEMPLATES[0].id),
  );
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [date, setDate] = useState(meeting?.date ?? today);
  const [projectId, setProjectId] = useState<number | null>(meeting?.projectId ?? null);
  const [attendees, setAttendees] = useState(meeting?.attendees ?? "");
  const [source, setSource] = useState(meeting?.source ?? "");
  const [notes, setNotes] = useState(
    () => meeting?.notes ?? (MEETING_TEMPLATES.find((t) => t.id === templateId) ?? MEETING_TEMPLATES[0]).notes,
  );
  const [showMeta, setShowMeta] = useState(false);
  const [showSource, setShowSource] = useState(() => !!meeting?.source || readLocal<boolean>(SOURCE_KEY, true));
  const [carryDismissed, setCarryDismissed] = useState(false);
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draftName = meeting ? `meeting-${meeting.id}` : "meeting-new";
  const sentences = useMemo(() => splitSentences(source), [source]);
  const projects = (work?.projects ?? []).filter((p) => !p.archived || p.id === projectId);
  const project = projects.find((p) => p.id === projectId);

  // 上次选的是自己存的模板：加载完再换上（还没动过纪要时）
  const customLoaded = !!custom;
  useEffect(() => {
    if (meeting || !custom || !templateId) return;
    const t = custom.find((c) => c.id === templateId);
    if (t) setNotes((n) => (isBlankNotes(n) ? t.notes : n));
  }, [customLoaded]);

  const sections = sectionsOf(notes);
  const taskSection = sections.find(isTaskSection) ?? "待办";
  const pickSections = sections.filter((s) => !isTaskSection(s));
  const [target, setTarget] = useState("");
  const pickTo = pickSections.includes(target) ? target : (pickSections[0] ?? "要点");

  const prev = useMemo(
    () => previousMeeting(meetings, { id: meeting?.id, title, date, projectId }),
    [meetings, meeting?.id, title, date, projectId],
  );
  const carry = carryDismissed ? [] : openTasksFrom(prev, notes);

  const applyTemplate = async (t: MeetingTemplate) => {
    if (t.id === templateId && notes === t.notes) return;
    if (
      !isBlankNotes(notes) &&
      !(await ui.confirm({
        title: `换成「${t.name}」模板？`,
        message: "已经写的纪要会被替换掉",
        confirmText: "替换",
        danger: true,
      }))
    )
      return;
    setNotes(t.notes);
    setTemplateId(t.id);
    writeLocal(TEMPLATE_KEY, t.id);
  };

  const removeTemplate = async (t: MeetingTemplate) => {
    if (!(await ui.confirm({ title: `删除模板「${t.name}」？`, confirmText: "删除", danger: true }))) return;
    try {
      const rest = (custom ?? []).filter((c) => c.id !== t.id).map(({ id, name, notes }) => ({ id, name, notes }));
      await mutateTemplates(api<MeetingTemplate[]>(TEMPLATES, { method: "PUT", body: { templates: rest } }), {
        revalidate: false,
      });
      if (templateId === t.id) setTemplateId(null);
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const save = async () => {
    if (!title.trim()) return setError("请填写会议标题");
    setBusy(true);
    setError("");
    const body = { title, date, projectId, attendees, source, notes: tidyNotes(notes) };
    try {
      const m = meeting
        ? await api<Meeting>(`/api/meetings/${meeting.id}`, { method: "PATCH", body })
        : await api<Meeting>(KEY, { body });
      clearDraft(draftName);
      ui.toast(meeting ? "已保存" : "已添加会议纪要");
      onSaved(m);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const toggleSource = () => {
    setShowSource(!showSource);
    writeLocal(SOURCE_KEY, !showSource);
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 md:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-start gap-2">
        <IconButton label="返回" onClick={onCancel} className="-ml-1 lg:hidden">
          <ArrowLeft size={18} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError("");
            }}
            placeholder={meeting ? "会议标题" : "会议标题，例如：知识库项目周会"}
            aria-label="会议标题"
            aria-invalid={!!error}
            autoFocus={!meeting}
            className="w-full bg-transparent text-lg leading-8 font-semibold outline-none placeholder:font-normal placeholder:text-faint"
          />
          {error && <p className="text-xs text-danger-text">{error}</p>}
          <button
            type="button"
            onClick={() => setShowMeta(!showMeta)}
            aria-expanded={showMeta}
            className="mt-0.5 flex max-w-full cursor-pointer items-center gap-1 rounded text-left text-[13px] text-muted hover:text-fg"
          >
            <ChevronRight size={14} className={cx("shrink-0 transition-transform", showMeta && "rotate-90")} />
            <span className="truncate">
              {[
                `${md(date)} ${weekdayLabel(date)}`,
                project?.name ?? "不选项目",
                attendees.trim() ? `参会：${attendees.trim()}` : "添加参会人",
              ].join(" · ")}
            </span>
          </button>
        </div>
      </div>

      {showMeta && (
        <div className="grid gap-3 rounded-lg bg-hover/60 p-3 sm:grid-cols-3">
          <Field label="日期">
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="报工项目">
            <Select
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">不选项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="参会人" hint="认待办的负责人时会用到">
            <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="张三、李四" />
          </Field>
        </div>
      )}

      {(!meeting || isBlankNotes(notes)) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="纪要模板">
          <span className="mr-1 text-xs text-faint">模板</span>
          {templates.map((t) => {
            const active = t.id === templateId;
            return (
              <span
                key={t.id}
                className={cx(
                  "group/tpl flex h-7 items-center rounded-full border text-xs transition-colors",
                  active
                    ? "border-accent bg-accent-soft/50 text-fg"
                    : "border-line text-muted hover:border-line-strong",
                )}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => void applyTemplate(t)}
                  className={cx("h-full cursor-pointer", t.custom ? "pr-1 pl-2.5" : "px-2.5")}
                >
                  {t.name}
                </button>
                {t.custom && (
                  <button
                    type="button"
                    aria-label={`删除模板「${t.name}」`}
                    onClick={() => void removeTemplate(t)}
                    className="mr-1 flex size-5 cursor-pointer items-center justify-center rounded-full text-faint hover:bg-hover hover:text-fg"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {carry.length > 0 && prev && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warn/40 bg-warn-soft/60 px-3 py-2 text-[13px]">
          <History size={15} className="shrink-0 text-warn-text" />
          <span className="min-w-0 flex-1">
            上次「{prev.title}」（{md(prev.date)}）还有 <b>{carry.length}</b> 项待办没完成：
            <span className="text-muted">
              {carry
                .slice(0, 3)
                .map((t) => t.text)
                .join("；")}
              {carry.length > 3 && " 等"}
            </span>
          </span>
          <span className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="primary"
              onClick={() => setNotes(carry.reduce((n, t) => appendToSection(n, taskSection, t.text), notes))}
            >
              带入这次的待办
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCarryDismissed(true)}>
              不用
            </Button>
          </span>
        </div>
      )}

      <div className={cx("grid items-start gap-4", showSource && "xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium">纪要</span>
            <Button size="sm" variant="ghost" aria-pressed={showSource} onClick={toggleSource}>
              {showSource ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              {showSource ? "收起原文" : source.trim() ? `会议原文 · ${sentences.length} 句` : "粘贴会议原文"}
            </Button>
          </div>
          <MarkdownEditor
            aria-label="纪要"
            value={notes}
            onChange={setNotes}
            onSubmit={() => void save()}
            draft={draftName}
            rows={16}
            grow
            placeholder="要点、结论和待办；待办写成「- [ ] 事情」，加上「@张三」「周五前」会认出负责人和截止日期"
          />
        </div>

        {showSource && (
          <section aria-label="会议原文" className="flex min-w-0 flex-col gap-2 xl:sticky xl:top-4">
            <Textarea
              rows={source ? 4 : 6}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              aria-label="会议原文"
              placeholder="粘贴会议文字稿：钉钉闪记、通义听悟、飞书妙记导出的文字，或者微信里的讨论，然后一句一句挑到纪要里"
              className="resize-y text-[13px] leading-6"
            />
            {sentences.length > 0 && (
              <div className="flex min-w-0 flex-col rounded-lg border border-line">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-1.5 text-xs text-faint">
                  <span className="mr-auto">从原文挑选 · {sentences.length} 句</span>
                  {pickSections.length > 1 && (
                    <label className="flex items-center gap-1">
                      加到
                      <select
                        value={pickTo}
                        onChange={(e) => setTarget(e.target.value)}
                        className="h-6 cursor-pointer rounded border border-control bg-surface px-1 text-xs text-fg"
                      >
                        {pickSections.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <ul className="max-h-[440px] overflow-y-auto">
                  {sentences.map((s, i) => {
                    const text = stripEnd(s);
                    const used = notes.includes(text);
                    return (
                      <li
                        key={i}
                        className="flex items-start gap-2 border-b border-line-soft px-3 py-1.5 last:border-b-0"
                      >
                        <span className={cx("min-w-0 flex-1 text-[13px] leading-6", used && "text-faint")}>{s}</span>
                        <span className="flex shrink-0 gap-1">
                          {[pickTo, taskSection].map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setNotes(appendToSection(notes, sec, text))}
                              className="h-6 max-w-[6.5rem] cursor-pointer truncate rounded border border-control px-1.5 text-xs text-muted hover:border-accent/60 hover:text-fg"
                            >
                              +{sec}
                            </button>
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          className="mr-auto"
          disabled={!sections.length}
          title={sections.length ? "保留小节标题，下次新建时可以直接选" : "纪要里要有「## 小节」标题才能存成模板"}
          onClick={() => setSaveTemplate(true)}
        >
          <BookmarkPlus size={15} />
          存为模板
        </Button>
        <span className="text-xs text-faint max-sm:hidden">Ctrl + 回车 保存</span>
        <Button onClick={onCancel}>取消</Button>
        <Button variant="primary" type="submit" loading={busy}>
          保存
        </Button>
      </div>

      <SaveTemplateDialog
        open={saveTemplate}
        onClose={() => setSaveTemplate(false)}
        notes={notes}
        custom={custom ?? []}
        onSaved={(list, id) => {
          void mutateTemplates(list, { revalidate: false });
          setTemplateId(id);
          writeLocal(TEMPLATE_KEY, id);
        }}
      />
    </form>
  );
}

/** 把现在的纪要结构存成模板（同名的覆盖） */
function SaveTemplateDialog({
  open,
  onClose,
  notes,
  custom,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  notes: string;
  custom: MeetingTemplate[];
  onSaved: (list: MeetingTemplate[], id: string) => void;
}) {
  const ui = useUI();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = toTemplate(notes);

  const save = async () => {
    const n = name.trim();
    if (!n) return setError("请填写模板名称");
    if (MEETING_TEMPLATES.some((t) => t.name === n)) return setError("和内置模板重名了，换个名字");
    setBusy(true);
    const same = custom.find((t) => t.name === n);
    const id = same?.id ?? `t${Date.now().toString(36)}`;
    const templates = [
      ...custom.filter((t) => t.id !== id).map(({ id, name, notes }) => ({ id, name, notes })),
      { id, name: n, notes: preview },
    ];
    try {
      const list = await api<MeetingTemplate[]>(TEMPLATES, { method: "PUT", body: { templates } });
      onSaved(list, id);
      ui.toast(same ? `已更新模板「${n}」` : `已存为模板「${n}」`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="存为模板"
      description="保留小节标题，内容清空；新建纪要时可以直接选"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            保存模板
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="模板名称" error={error}>
          <Input
            data-autofocus
            value={name}
            maxLength={20}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void save();
              }
            }}
            placeholder="例如：项目启动会"
            aria-invalid={!!error}
          />
        </Field>
        <pre className="max-h-48 overflow-y-auto rounded-lg bg-chip px-3 py-2 text-xs leading-5 whitespace-pre-wrap text-muted">
          {preview}
        </pre>
      </div>
    </Dialog>
  );
}

/** 引用了这次会议的工作记录、其他会议 */
function MeetingBacklinks({ id }: { id: number }) {
  const { data } = useBacklinks();
  const sources = data?.[refKey("meeting", id)] ?? [];
  if (!sources.length) return null;
  return (
    <section aria-label="被引用" className="rounded-lg border border-line px-4 py-2.5">
      <h3 className="mb-1 text-[13px] font-medium">
        被引用 <span className="font-normal text-faint">{sources.length}</span>
      </h3>
      <BacklinkList sources={sources} />
    </section>
  );
}
