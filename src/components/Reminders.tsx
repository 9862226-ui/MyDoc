"use client";

import { Bell, CalendarClock, ExternalLink, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import NextLink from "next/link";
import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { api, refreshData, useAppData } from "@/lib/client";
import { shortDate } from "@/lib/format";
import {
  nextDueDate,
  REMIND_DAY_OPTIONS,
  remindDaysLabel,
  reminderState,
  REPEAT_LABELS,
  sortReminders,
  type ReminderLevel,
} from "@/lib/reminders";
import type { NotifyConfig } from "@/lib/notify";
import type { Reminder, RepeatKind } from "@/lib/types";
import {
  Button,
  cx,
  Dialog,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  Menu,
  Select,
  Skeleton,
  Tag,
  Textarea,
} from "./ui";
import { DueHeader } from "./DueHeader";
import { useUI } from "./ui-context";

const REPEATS: RepeatKind[] = ["none", "monthly", "yearly"];

/* ---------- 添加 / 编辑 ---------- */

export function ReminderDialog({
  open,
  onClose,
  reminder,
  init,
}: {
  open: boolean;
  onClose: () => void;
  reminder?: Reminder;
  init?: { title?: string; note?: string };
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={reminder ? "编辑提醒" : "添加提醒"}
      description={reminder ? undefined : "记下账号、域名、服务器、会员的到期时间，快到期时提醒你"}
      bodyClassName="pb-0"
    >
      <ReminderForm reminder={reminder} init={init} onDone={onClose} />
    </Dialog>
  );
}

function ReminderForm({
  reminder,
  init,
  onDone,
}: {
  reminder?: Reminder;
  init?: { title?: string; note?: string };
  onDone: () => void;
}) {
  const ui = useUI();
  const [title, setTitle] = useState(reminder?.title ?? init?.title ?? "");
  const [dueDate, setDueDate] = useState(reminder?.dueDate ?? "");
  const [repeat, setRepeat] = useState<RepeatKind>(reminder?.repeat ?? "yearly");
  const [remindDays, setRemindDays] = useState(reminder?.remindDays ?? 7);
  const [url, setUrl] = useState(reminder?.url ?? "");
  const [note, setNote] = useState(reminder?.note ?? init?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "title" | "dueDate" | "url" | "other"; message: string } | null>(null);

  const dayOptions = REMIND_DAY_OPTIONS.includes(remindDays)
    ? REMIND_DAY_OPTIONS
    : [...REMIND_DAY_OPTIONS, remindDays].sort((a, b) => a - b);

  const submit = async () => {
    if (!title.trim()) return setError({ field: "title", message: "名称不能为空" });
    if (!dueDate) return setError({ field: "dueDate", message: "请选择到期日期" });
    setBusy(true);
    setError(null);
    const body = { title, dueDate, repeat, remindDays, url, note };
    try {
      if (reminder) await api(`/api/reminders/${reminder.id}`, { method: "PATCH", body });
      else await api("/api/reminders", { body });
      await refreshData();
      ui.toast(reminder ? "已保存" : "已添加提醒");
      onDone();
    } catch (e) {
      const message = (e as Error).message;
      setError({ field: message.includes("链接") ? "url" : "other", message });
      setBusy(false);
    }
  };

  const err = (field: string) => (error?.field === field ? error.message : undefined);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <Field label="名称" error={err("title")}>
        <Input
          data-autofocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          aria-invalid={!!err("title")}
          placeholder="例如：阿里云服务器、域名 mydoc.cn、视频会员"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="到期日期"
          error={err("dueDate")}
          hint={repeat !== "none" && dueDate ? `处理完后顺延到 ${shortDate(nextDueDate(dueDate, repeat))}` : undefined}
        >
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-invalid={!!err("dueDate")}
          />
        </Field>
        <Field label="提前提醒">
          <Select value={remindDays} onChange={(e) => setRemindDays(Number(e.target.value))}>
            {dayOptions.map((d) => (
              <option key={d} value={d}>
                {remindDaysLabel(d)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field as="div" label={<span id="repeat-label">重复</span>}>
        <div role="radiogroup" aria-labelledby="repeat-label" className="flex flex-wrap gap-2">
          {REPEATS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={repeat === r}
              onClick={() => setRepeat(r)}
              className={cx(
                "h-8 cursor-pointer rounded-md border px-3.5 transition-colors",
                repeat === r
                  ? "border-accent bg-accent-soft text-accent-text"
                  : "border-control bg-surface hover:border-accent/60",
              )}
            >
              {REPEAT_LABELS[r]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="续费 / 管理地址" error={err("url")}>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          aria-invalid={!!err("url")}
          placeholder="可选，到期时一点就能打开"
        />
      </Field>

      <Field label="备注">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="可选，比如登录账号、绑定的手机号、价格"
          className="resize-y"
        />
      </Field>

      {error?.field === "other" && <p className="text-xs text-danger-text">{error.message}</p>}

      <DialogFooter>
        <Button onClick={onDone}>取消</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {reminder ? "保存" : "添加"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ---------- 列表页 ---------- */

const LEVEL_STYLE: Record<ReminderLevel, { tile: string; tag: "danger" | "warn" | "default" | "success" }> = {
  overdue: { tile: "bg-danger-soft text-danger-text", tag: "danger" },
  soon: { tile: "bg-warn-soft text-warn-text", tag: "warn" },
  later: { tile: "bg-field text-muted", tag: "default" },
  done: { tile: "bg-field text-faint", tag: "success" },
};

export function RemindersView() {
  const { data } = useAppData();
  const ui = useUI();

  if (!data) {
    return (
      <Page>
        <div className="flex flex-col">
          {[48, 36, 56].map((w) => (
            <div key={w} className="flex h-16 items-center gap-3 border-b border-line-soft md:px-3">
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </Page>
    );
  }

  const all = sortReminders(data.reminders);
  const states = new Map(all.map((r) => [r.id, reminderState(r)]));
  const level = (r: Reminder) => states.get(r.id)!.level;
  const due = all.filter((r) => level(r) === "overdue" || level(r) === "soon");
  const later = all.filter((r) => level(r) === "later");
  const done = all.filter((r) => level(r) === "done").reverse();

  if (all.length === 0) {
    return (
      <Page>
        <EmptyState
          illustration={null}
          icon={<Bell size={40} strokeWidth={1.5} />}
          title="还没有提醒"
          actions={
            <Button variant="primary" onClick={() => ui.editReminder()}>
              <Plus size={16} />
              添加提醒
            </Button>
          }
        >
          把账号、域名、服务器、会员的到期时间记下来，快到期时会在工作台和侧边栏提醒你
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page count={all.length - done.length}>
      {due.length > 0 && (
        <Section title="需要处理" count={due.length}>
          {due.map((r) => (
            <ReminderRow key={r.id} reminder={r} />
          ))}
        </Section>
      )}
      {later.length > 0 && (
        <Section title={due.length ? "以后" : "全部提醒"} count={later.length}>
          {later.map((r) => (
            <ReminderRow key={r.id} reminder={r} />
          ))}
        </Section>
      )}
      {done.length > 0 && (
        <details className="group">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-1 text-[13px] text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
            <span className="transition-transform group-open:rotate-90">›</span>
            已完成 {done.length}
          </summary>
          <div className="mt-1">
            {done.map((r) => (
              <ReminderRow key={r.id} reminder={r} />
            ))}
          </div>
        </details>
      )}
    </Page>
  );
}

function Page({ count, children }: { count?: number; children: ReactNode }) {
  const { data: notify } = useSWR("/api/settings/notify", (url: string) => api<{ config: NotifyConfig }>(url));
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pt-4 pb-12 md:px-8 md:pt-6">
      <DueHeader active="accounts" />
      {!!count && notify && !notify.config.enabled && (
        <p className="-mt-2 text-[13px] text-muted">
          快到期时只会在 MyDoc 里提醒。
          <NextLink href="/settings#notify" className="text-accent-text hover:underline">
            开启微信 / 钉钉推送
          </NextLink>
          ，不打开 MyDoc 也不会错过。
        </p>
      )}
      {children}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h2 className="flex h-9 items-center gap-2 border-b border-line text-[13px] font-medium text-muted">
        {title}
        <span className="font-normal text-faint tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function ReminderRow({ reminder: r }: { reminder: Reminder }) {
  const ui = useUI();
  const state = reminderState(r);
  const style = LEVEL_STYLE[state.level];
  const isDone = state.level === "done";

  const run = async (fn: () => Promise<unknown>, message?: string, undo?: () => Promise<unknown>) => {
    try {
      await fn();
      await refreshData();
      if (message) {
        ui.toast(message, undo && { action: { label: "撤销", onClick: () => void run(undo) } });
      }
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  const restore = () =>
    api(`/api/reminders/${r.id}`, { method: "PATCH", body: { dueDate: r.dueDate, done: !!r.doneAt } });

  const complete = () =>
    run(
      () => api(`/api/reminders/${r.id}/complete`, { body: {} }),
      r.repeat === "none" ? `「${r.title}」已完成` : `已顺延到 ${shortDate(nextDueDate(r.dueDate, r.repeat))}`,
      restore,
    );

  const remove = async () => {
    const ok = await ui.confirm({
      title: "删除这个提醒？",
      message: `「${r.title}」删除后无法恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (ok) void run(() => api(`/api/reminders/${r.id}`, { method: "DELETE" }), "已删除");
  };

  const meta = [
    shortDate(r.dueDate),
    r.repeat !== "none" && REPEAT_LABELS[r.repeat],
    !isDone && `${remindDaysLabel(r.remindDays)}提醒`,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 border-b border-line-soft py-3 md:px-3 md:hover:bg-hover">
      <span aria-hidden className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg", style.tile)}>
        <CalendarClock size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cx("truncate font-medium", isDone && "text-muted line-through")} title={r.title}>
            {r.title}
          </span>
          <Tag tone={style.tag} className="hidden shrink-0 md:inline-flex">
            {state.label}
          </Tag>
        </span>
        {/* 手机上状态放到第二行，给名称留出位置 */}
        <span className="flex min-w-0 items-center gap-1.5 text-xs leading-[18px] text-faint">
          <Tag tone={style.tag} className="shrink-0 md:hidden">
            {state.label}
          </Tag>
          <span className="truncate" title={r.note || undefined}>
            {meta.join(" · ")}
            {r.note && ` · ${r.note.replace(/\s+/g, " ")}`}
          </span>
        </span>
      </div>
      <span className="flex shrink-0 items-center gap-1">
        {r.url && (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="打开续费地址"
            title="打开续费地址"
            className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-nav-hover hover:text-fg"
          >
            <ExternalLink size={15} />
          </a>
        )}
        {isDone ? (
          <Button
            size="sm"
            onClick={() =>
              void run(() => api(`/api/reminders/${r.id}`, { method: "PATCH", body: { done: false } }), "已重新打开")
            }
          >
            <RotateCcw size={14} />
            重新打开
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void complete()}
            title={r.repeat === "none" ? undefined : "顺延到下一个周期"}
          >
            {r.repeat === "none" ? "完成" : "已续期"}
          </Button>
        )}
        <Menu
          items={[
            { label: "编辑", icon: <Pencil size={15} />, onSelect: () => ui.editReminder(r) },
            { label: "删除", icon: <Trash2 size={15} />, danger: true, onSelect: () => void remove() },
          ]}
        />
      </span>
    </div>
  );
}
