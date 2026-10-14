"use client";

import { ChevronLeft, ChevronRight, CircleCheck, Copy, PenLine, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildDaily,
  dailyText,
  dayStatus,
  listDays,
  shiftMonth,
  splitEntries,
  weekdayLabel,
  type DayStatus,
} from "@/lib/worklog";
import { useWorkAll } from "./WorkCalendar";
import { Button, cx, IconButton, Select, Skeleton } from "./ui";
import { StatusBadge, useCopy, useSubmit } from "./work-ui";

type Filter = "all" | DayStatus;

const md = (date: string) => `${Number(date.slice(5, 7))}-${date.slice(8)}`;

/** 日报列表：按月列出每个工作日的日报，标出已提交、未提交、漏记 */
export function WorkDailyList({ today, onOpenDay }: { today: string; onOpenDay: (date: string) => void }) {
  const { data } = useWorkAll();
  const copy = useCopy();
  const submit = useSubmit();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    if (!data) return [];
    return listDays(data, month, today).map((d) => ({
      date: d,
      status: dayStatus(data, d, today)!,
      report: buildDaily(data, d),
    }));
  }, [data, month, today]);

  if (!data) return <Skeleton className="h-[480px] rounded-xl" />;

  const count = (s: DayStatus) => rows.filter((r) => r.status === s).length;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const [y, m] = month.split("-").map(Number);

  return (
    <section aria-label="日报列表" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-3 md:px-5">
        <div className="flex items-center gap-1">
          <IconButton label="上个月" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={18} />
          </IconButton>
          <h2 className="min-w-[96px] text-center text-base font-semibold tabular-nums">
            {y}年{m}月
          </h2>
          <IconButton
            label="下个月"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= today.slice(0, 7)}
          >
            <ChevronRight size={18} />
          </IconButton>
        </div>
        <p className="text-[13px] text-muted">
          已提交 {count("submitted")} 天 ·{" "}
          <span className={cx(count("unsubmitted") > 0 && "text-warn-text")}>未提交 {count("unsubmitted")} 天</span> ·{" "}
          <span className={cx(count("missed") > 0 && "text-warn-text")}>漏记 {count("missed")} 天</span>
        </p>
        <Select
          aria-label="按状态筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="w-28 md:ml-auto"
        >
          <option value="all">全部</option>
          <option value="unsubmitted">未提交</option>
          <option value="missed">漏记</option>
          <option value="submitted">已提交</option>
        </Select>
      </div>

      {/* 表头（只在电脑上显示） */}
      <div className="grid grid-cols-[6.5rem_3rem_3rem_10rem_minmax(0,1fr)_4rem_9.5rem] gap-3 border-b border-line px-5 py-2 text-xs text-faint max-md:hidden">
        <span>日期</span>
        <span>条数</span>
        <span>工时</span>
        <span>主要项目</span>
        <span>工作内容</span>
        <span>状态</span>
        <span />
      </div>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-faint">
          {rows.length ? "没有符合条件的日报" : "这个月还没有日报"}
        </p>
      ) : (
        <ul>
          {shown.map(({ date, status, report: r }) => {
            const first = splitEntries(r.amSummary)[0] ?? "";
            const more = r.logCount > 1 ? ` 等 ${r.logCount} 条` : "";
            return (
              <li
                key={date}
                className="group/row grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-hover md:grid-cols-[6.5rem_3rem_3rem_10rem_minmax(0,1fr)_4rem_9.5rem] md:px-5"
                onClick={() => onOpenDay(date)}
              >
                <span className="text-[13px] font-medium tabular-nums">
                  {md(date)} {weekdayLabel(date)}
                  {date === today && <span className="ml-1 text-xs font-normal text-accent-text">今天</span>}
                </span>
                <span className="text-[13px] text-muted tabular-nums max-md:hidden">{r.logCount || "—"}</span>
                <span className="text-[13px] text-muted tabular-nums max-md:hidden">{r.logCount ? r.hours : "—"}</span>
                <span className="truncate text-[13px] text-muted max-md:hidden">{r.logCount ? r.amProject : ""}</span>
                <span className="min-w-0 truncate text-[13px] max-md:col-span-2 max-md:row-start-2">
                  {r.logCount ? (
                    <>
                      {first.replace(/^\d+\.\s*/, "")}
                      <span className="text-faint">{more}</span>
                    </>
                  ) : (
                    <span className="text-faint">工作日没有记录</span>
                  )}
                  <span className="text-xs text-faint md:hidden">
                    {r.logCount ? ` · ${r.amProject} · ${r.hours} 小时` : ""}
                  </span>
                </span>
                <span className="max-md:col-start-2 max-md:row-start-1">
                  <StatusBadge status={status} />
                </span>
                <span className="flex justify-end gap-1 max-md:col-span-2" onClick={(e) => e.stopPropagation()}>
                  {status === "missed" ? (
                    <Button size="sm" variant="ghost" onClick={() => onOpenDay(date)}>
                      <PenLine size={14} />
                      补记
                    </Button>
                  ) : (
                    <>
                      <IconButton
                        label="复制全文"
                        size="sm"
                        onClick={() => void copy(`${md(date)} 日报`, dailyText(r))}
                      >
                        <Copy size={15} />
                      </IconButton>
                      {status === "submitted" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void submit.set("daily", date, false, `${md(date)} 日报`)}
                          title="取消已提交"
                        >
                          <Undo2 size={14} />
                          取消
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => void submit.set("daily", date, true, `${md(date)} 日报`)}>
                          <CircleCheck size={14} />
                          标记已提交
                        </Button>
                      )}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
