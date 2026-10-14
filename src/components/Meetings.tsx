"use client";

import {
  ArrowLeft,
  Bell,
  ChevronRight,
  CircleCheck,
  Copy,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { api, useAppData } from "@/lib/client";
import { localDate } from "@/lib/format";
import { toggleTask } from "@/lib/md-edit";
import { appendToSection, meetingText, NOTES_TEMPLATE, parseTasks, splitSentences, type Meeting } from "@/lib/meetings";
import { currentPeriod, weekdayLabel } from "@/lib/worklog";
import { refKey } from "@/lib/refs";
import { BacklinkList, useBacklinks } from "./Backlinks";
import { Markdown } from "./Markdown";
import { clearDraft, MarkdownEditor } from "./MarkdownEditor";
import { Button, cx, EmptyState, Field, IconButton, Input, SearchField, Select, Skeleton, Textarea } from "./ui";
import { useUI } from "./ui-context";
import { useWorkAll } from "./WorkCalendar";
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
          <Button size="sm" onClick={() => void copy("会议纪要", meetingText(m, project?.name))}>
            <Copy size={14} />
            复制纪要
          </Button>
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
              加入工作记录后，日报、周报里就有了；有截止时间的建成提醒
            </span>
          </h3>
          <ul>
            {tasks.map((t) => {
              const inWork = work?.logs.some((l) => l.content === t.text);
              const inReminder = app?.reminders.some((r) => r.title === t.text);
              return (
                <li
                  key={t.index}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2 last:border-b-0"
                >
                  <span className={cx("min-w-[12rem] flex-1 text-[13px]", t.done && "text-muted line-through")}>
                    {t.text}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs">
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          ui.editReminder(undefined, { title: t.text, note: `来自会议「${m.title}」（${m.date}）` })
                        }
                      >
                        <Bell size={14} />
                        建提醒
                      </Button>
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

function MeetingEditor({
  meeting,
  today,
  onCancel,
  onSaved,
}: {
  meeting?: Meeting;
  today: string;
  onCancel: () => void;
  onSaved: (m: Meeting) => void;
}) {
  const ui = useUI();
  const { data: work } = useWorkAll();
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [date, setDate] = useState(meeting?.date ?? today);
  const [projectId, setProjectId] = useState<number | null>(meeting?.projectId ?? null);
  const [attendees, setAttendees] = useState(meeting?.attendees ?? "");
  const [source, setSource] = useState(meeting?.source ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? NOTES_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draftName = meeting ? `meeting-${meeting.id}` : "meeting-new";
  const sentences = useMemo(() => splitSentences(source), [source]);
  const projects = (work?.projects ?? []).filter((p) => !p.archived || p.id === projectId);

  const save = async () => {
    if (!title.trim()) return setError("请填写会议标题");
    setBusy(true);
    setError("");
    const body = { title, date, projectId, attendees, source, notes };
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

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 md:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-base font-semibold">{meeting ? "编辑会议纪要" : "新建会议纪要"}</h2>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="会议标题" error={error}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：知识库项目周会"
            aria-invalid={!!error}
            autoFocus={!meeting}
          />
        </Field>
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
        <Field label="参会人（可选）">
          <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="张三、李四" />
        </Field>
      </div>

      <Field label="会议文字稿（可选）" hint="钉钉会议的「闪记」、微信里的讨论，复制过来后可以一句一句挑出要点和待办">
        <Textarea
          rows={source ? 5 : 3}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="粘贴会议文字稿"
          className="resize-y text-[13px] leading-6"
        />
      </Field>

      <div className={cx("grid gap-4", sentences.length > 0 && "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}>
        {sentences.length > 0 && (
          <section aria-label="从原文挑选" className="flex min-w-0 flex-col rounded-lg border border-line">
            <h3 className="border-b border-line px-3 py-2 text-xs text-faint">
              从原文挑选 · {sentences.length} 句，点「要点」「待办」加到右边
            </h3>
            <ul className="max-h-[420px] overflow-y-auto">
              {sentences.map((s, i) => {
                const used = notes.includes(s.replace(/[。！？!?；;]$/, ""));
                return (
                  <li key={i} className="flex items-start gap-2 border-b border-line-soft px-3 py-1.5 last:border-b-0">
                    <span className={cx("min-w-0 flex-1 text-[13px] leading-6", used && "text-faint")}>{s}</span>
                    <span className="flex shrink-0 gap-1">
                      {(["要点", "待办"] as const).map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setNotes(appendToSection(notes, sec, s.replace(/[。！？!?；;]$/, "")))}
                          className="h-6 cursor-pointer rounded border border-control px-1.5 text-xs text-muted hover:border-accent/60 hover:text-fg"
                        >
                          +{sec}
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <Field label="纪要" as="div">
          <MarkdownEditor
            aria-label="纪要"
            value={notes}
            onChange={setNotes}
            onSubmit={() => void save()}
            draft={draftName}
            rows={12}
            placeholder="要点、结论和待办；待办写成「- [ ] 事情」，查看时可以直接打勾"
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-faint max-sm:hidden">Ctrl + 回车 保存</span>
        <Button onClick={onCancel}>取消</Button>
        <Button variant="primary" type="submit" loading={busy}>
          保存
        </Button>
      </div>
    </form>
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
