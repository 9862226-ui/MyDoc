"use client";

import { ChevronDown, Copy, History, Wand2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import {
  HEALTH,
  isoWeek,
  projectStatus,
  projectStatusText,
  suggestNote,
  weekStart,
  type Health,
  type ProjectStatusRow,
  type ProjectUpdate,
  type WorkData,
} from "@/lib/worklog";
import { Button, cx, Textarea } from "./ui";
import { useUI } from "./ui-context";
import { ReportCard, useCopy } from "./work-ui";

const HEALTHS: Health[] = ["on_track", "at_risk", "off_track"];

/** 状态的颜色：正常绿、有风险黄、已延期红 */
export const HEALTH_CLASS: Record<Health, { dot: string; pill: string }> = {
  on_track: { dot: "bg-success", pill: "bg-success-soft text-success-text" },
  at_risk: { dot: "bg-warn", pill: "bg-warn-soft text-warn-text" },
  off_track: { dot: "bg-danger", pill: "bg-danger-soft text-danger-text" },
};

export function HealthDot({ health, className }: { health: Health; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-2 shrink-0 rounded-full", HEALTH_CLASS[health].dot, className)}
    />
  );
}

/** 一次进展：● 有风险 · 说明 */
function UpdateLine({ u, prefix }: { u: ProjectUpdate; prefix: string }) {
  return (
    <span className="flex min-w-0 items-start gap-1.5">
      <span className="shrink-0">{prefix}</span>
      <HealthDot health={u.health} className="mt-[5px]" />
      <span className="shrink-0">{HEALTH[u.health]}</span>
      {u.note && <span className="min-w-0 break-words">· {u.note}</span>}
    </span>
  );
}

/** 周报下面的「项目进展」：每个项目标个状态，写一句进展 */
export function ProjectStatusCard({ data, date, onSaved }: { data: WorkData; date: string; onSaved: () => void }) {
  const copy = useCopy();
  const rows = projectStatus(data, date);
  const text = projectStatusText(rows);
  const written = rows.filter((r) => r.update).length;
  const risky = rows.filter((r) => (r.update ?? r.last)?.health !== "on_track" && (r.update ?? r.last)).length;

  return (
    <ReportCard
      title="项目进展"
      subtitle={
        rows.length
          ? `${written}/${rows.length} 个项目已写${risky ? ` · ${risky} 个有风险或延期` : ""} · 有风险的项目会一直跟着，直到恢复正常`
          : "这一周还没有项目上的记录"
      }
      actions={
        <Button size="sm" disabled={!text} onClick={() => void copy("项目进展", text)}>
          <Copy size={14} />
          复制
        </Button>
      }
    >
      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <ProjectRow key={r.project.id} row={r} week={weekStart(date)} onSaved={onSaved} />
          ))}
        </div>
      )}
    </ReportCard>
  );
}

function ProjectRow({ row, week, onSaved }: { row: ProjectStatusRow; week: string; onSaved: () => void }) {
  const ui = useUI();
  const { project, update, last, items } = row;
  const [note, setNote] = useState(update?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setNote(update?.note ?? ""), [update?.note, week]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [note]);

  // 没写过时，状态默认沿用上次的
  const health = update?.health ?? last?.health;

  const save = async (h: Health, n: string) => {
    setBusy(true);
    try {
      await api("/api/work/project-updates", {
        method: "PUT",
        body: { projectId: project.id, week, health: h, note: n },
      });
      onSaved();
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
    setBusy(false);
  };

  const clear = async () => {
    try {
      await api(`/api/work/project-updates?projectId=${project.id}&week=${week}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  return (
    <section
      aria-label={project.name}
      className={cx("rounded-lg border px-4 py-3", row.missing ? "border-warn/50" : "border-line")}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-[14rem] flex-1 items-center gap-2">
          {health && <HealthDot health={health} />}
          <h3 className="truncate font-medium">{project.name}</h3>
          <span className="shrink-0 text-xs text-faint">
            {items.length ? `本周 ${items.length} 件事` : "本周没有记录"}
          </span>
          {row.missing && (
            <span className="shrink-0 rounded bg-warn-soft px-1.5 text-[11px] leading-[18px] text-warn-text">
              待更新
            </span>
          )}
        </div>
        <div role="radiogroup" aria-label={`${project.name}的状态`} className="flex shrink-0 rounded-md bg-field p-0.5">
          {HEALTHS.map((h) => {
            const on = update?.health === h;
            return (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => void save(h, note)}
                className={cx(
                  "flex h-7 cursor-pointer items-center gap-1.5 rounded px-2.5 text-[13px] transition-colors",
                  on
                    ? cx("font-medium shadow-[0_1px_2px_var(--shadow)]", HEALTH_CLASS[h].pill)
                    : "text-muted hover:text-fg",
                )}
              >
                <HealthDot health={h} />
                {HEALTH[h]}
              </button>
            );
          })}
        </div>
      </div>

      <Textarea
        ref={ref}
        rows={1}
        value={note}
        aria-label={`${project.name}的进展`}
        placeholder={update ? "写一句进展" : "这周的进展、风险或需要协调的事；先选状态或写完点别处就保存"}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if (note.trim() !== (update?.note ?? "")) void save(health ?? "on_track", note);
        }}
        className="mt-2.5 min-h-0 resize-none leading-6"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
        {items.length > 0 && !note.trim() && (
          <button
            type="button"
            onClick={() => {
              setNote(suggestNote(items));
              requestAnimationFrame(() => ref.current?.focus());
            }}
            className="flex cursor-pointer items-center gap-1 hover:text-fg"
          >
            <Wand2 size={13} />
            用本周记录填
          </button>
        )}
        {update && (
          <button
            type="button"
            onClick={() => void clear()}
            className="flex cursor-pointer items-center gap-1 hover:text-fg"
          >
            <X size={13} />
            清除本周进展
          </button>
        )}
        {last && <UpdateLine u={last} prefix={`上次（第 ${isoWeek(last.week)} 周）`} />}
        {row.history.length > 1 && (
          <button
            type="button"
            aria-expanded={history}
            onClick={() => setHistory(!history)}
            className="ml-auto flex cursor-pointer items-center gap-1 hover:text-fg"
          >
            <History size={13} />
            历史 {row.history.length}
            <ChevronDown size={13} className={cx("transition-transform", history && "rotate-180")} />
          </button>
        )}
      </div>
      {history && (
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2 text-xs text-muted">
          {row.history.map((u) => (
            <li key={u.id}>
              <UpdateLine u={u} prefix={`第 ${isoWeek(u.week)} 周`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
