"use client";

import { CircleCheck, Copy, Download, Undo2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  buildWeekly,
  dayStats,
  filterLogs,
  isoWeek,
  logsCsv,
  shiftDate,
  weekdayLabel,
  weeksWithLogs,
  weekStart,
  weekStatus,
  weeklyText,
  type WorkLog,
} from "@/lib/worklog";
import { heatClass, useWorkAll } from "./WorkCalendar";
import { Button, cx, IconButton, SearchField, Select, Skeleton } from "./ui";
import { StatusBadge, useCopy, useSubmit } from "./work-ui";

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
const PAGE = 12;

/** 关键字高亮 */
function highlight(text: string, q: string): ReactNode {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return text;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded-sm bg-warn-soft px-0.5 text-fg">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 周报页左边：所有周报的列表，可以搜索、按项目筛选、导出 */
export function WorkHistory({
  selected,
  today,
  onSelectWeek,
  onOpenDay,
}: {
  selected: string;
  today: string;
  onSelectWeek: (date: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const { data } = useWorkAll();
  const [q, setQ] = useState("");
  const [project, setProject] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "unsubmitted" | "submitted">("all");
  const copy = useCopy();
  const submit = useSubmit();
  const [limit, setLimit] = useState(PAGE);
  const stats = useMemo(() => (data ? dayStats(data) : null), [data]);
  const projectId = project === "all" ? "all" : project === "none" ? null : Number(project);
  const filtering = !!q.trim() || project !== "all";
  const found = useMemo(
    () => (data && filtering ? filterLogs(data.logs, q, projectId) : []),
    [data, q, projectId, filtering],
  );

  if (!data || !stats) return <Skeleton className="h-[480px] rounded-xl" />;

  // 本周没有记录也放在最上面
  const weeks = [...new Set([weekStart(today), ...weeksWithLogs(data.logs)])].sort().reverse();
  const visible = weeks.filter((w) => {
    if (status === "all") return true;
    const r = buildWeekly(data, w);
    return status === "submitted" ? !!r.submittedAt : r.logCount > 0 && !r.submittedAt;
  });
  const shown = visible.slice(0, limit);

  const exportCsv = () => {
    const logs = filtering ? found : data.logs;
    download(`mydoc-worklog-${today}.csv`, logsCsv(logs, data.projects));
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索做过的事"
          aria-label="搜索工作记录"
          className="min-w-0 flex-1 basis-40"
        />
        <Select
          aria-label="按项目筛选"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="w-auto max-w-[180px] min-w-0 flex-1 basis-28"
        >
          <option value="all">全部项目</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="none">未选择项目</option>
        </Select>
        <Select
          aria-label="按提交状态筛选"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="w-auto min-w-0 flex-1 basis-24 sm:max-w-[120px]"
        >
          <option value="all">全部状态</option>
          <option value="unsubmitted">未提交</option>
          <option value="submitted">已提交</option>
        </Select>
        <Button onClick={exportCsv} title={filtering ? "导出筛选出来的记录" : "导出全部记录"}>
          <Download size={15} />
          导出
        </Button>
      </div>

      {filtering ? (
        <SearchResults logs={found} q={q} onOpenDay={onOpenDay} onSelectWeek={onSelectWeek} />
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {shown.map((w) => {
              const r = buildWeekly(data, w);
              const active = w === selected;
              const current = w === weekStart(today);
              return (
                <li
                  key={w}
                  className={cx(
                    "overflow-hidden rounded-xl border transition-colors",
                    active ? "border-accent bg-accent-soft/40" : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => onSelectWeek(w)}
                    className="flex w-full cursor-pointer flex-col gap-1.5 p-3.5 pb-2 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">第 {r.week} 周</span>
                      {current && (
                        <span className="rounded bg-accent-soft px-1.5 text-xs leading-5 text-accent-text">本周</span>
                      )}
                      <span className="text-xs text-faint tabular-nums">
                        {md(r.start)} ~ {md(r.end)}
                      </span>
                      <span className="ml-auto flex gap-[3px]" aria-hidden>
                        {Array.from({ length: 7 }, (_, i) => shiftDate(w, i)).map((d) => (
                          <span key={d} className={cx("size-2.5 rounded-[2px]", heatClass(stats.get(d)?.count))} />
                        ))}
                      </span>
                    </div>
                    {r.logCount ? (
                      <>
                        <p className="text-xs text-muted">
                          工作 {r.workDays} 天 · {r.logCount} 条 · {r.hours} 小时
                        </p>
                        <p className="line-clamp-3 text-[13px] leading-5 whitespace-pre-line text-fg/85">
                          {r.summaryText}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-faint">这周还没有记录</p>
                    )}
                  </button>
                  {r.logCount > 0 && (
                    <div className="flex items-center gap-1 px-3.5 pb-2.5">
                      <StatusBadge status={weekStatus(r)} />
                      <IconButton
                        label="复制全文"
                        size="sm"
                        className="ml-auto"
                        onClick={() => void copy(`第 ${r.week} 周周报`, weeklyText(r))}
                      >
                        <Copy size={15} />
                      </IconButton>
                      {r.submittedAt ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="取消已提交"
                          onClick={() => void submit.set("weekly", w, false, `第 ${r.week} 周周报`)}
                        >
                          <Undo2 size={14} />
                          取消
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => void submit.set("weekly", w, true, `第 ${r.week} 周周报`)}>
                          <CircleCheck size={14} />
                          标记已提交
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && <p className="py-10 text-center text-[13px] text-faint">没有符合条件的周报</p>}
          {visible.length > limit && (
            <Button variant="ghost" onClick={() => setLimit(limit + PAGE)}>
              显示更早的周报（还有 {visible.length - limit} 周）
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function SearchResults({
  logs,
  q,
  onOpenDay,
  onSelectWeek,
}: {
  logs: WorkLog[];
  q: string;
  onOpenDay: (date: string) => void;
  onSelectWeek: (date: string) => void;
}) {
  const { data } = useWorkAll();
  const groups = useMemo(() => {
    const map = new Map<string, WorkLog[]>();
    for (const l of logs) {
      const w = weekStart(l.date);
      map.set(w, [...(map.get(w) ?? []), l]);
    }
    return [...map.entries()];
  }, [logs]);
  const days = new Set(logs.map((l) => l.date)).size;

  if (!logs.length) return <p className="py-12 text-center text-[13px] text-faint">没有找到相关的记录</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-[13px] text-muted">
        找到 {logs.length} 条，分布在 {days} 天
        {logs.length > 0 && `（${logs[logs.length - 1].date} ~ ${logs[0].date}）`}
      </p>
      {groups.map(([w, items]) => (
        <section key={w}>
          <button
            type="button"
            onClick={() => onSelectWeek(w)}
            className="cursor-pointer px-1 pb-1.5 text-xs text-faint hover:text-fg"
          >
            第 {isoWeek(w)} 周 · {md(w)} ~ {md(shiftDate(w, 6))}
          </button>
          <ul className="overflow-hidden rounded-xl border border-line bg-surface">
            {items.map((l) => (
              <li key={l.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpenDay(l.date)}
                  className="flex w-full cursor-pointer gap-3 px-3 py-2.5 text-left hover:bg-hover"
                >
                  <span className="w-[88px] shrink-0 text-xs leading-6 whitespace-nowrap text-faint tabular-nums">
                    {md(l.date)} {weekdayLabel(l.date)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block leading-6 break-words">{highlight(l.content, q)}</span>
                    <span className="text-xs text-faint">
                      {data?.projects.find((p) => p.id === l.projectId)?.name ?? "未选择项目"}
                      {!l.done && <span className="text-warn-text"> · 未完成</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
