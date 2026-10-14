"use client";

import { CalendarCog, ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/client";
import { projectColor } from "@/lib/colors";
import {
  dayStats,
  isMissed,
  isoWeek,
  monthGrid,
  projectTotals,
  reportKey,
  shiftDate,
  shiftMonth,
  weekdayLabel,
  weekStart,
  type DayStat,
  type WorkData,
} from "@/lib/worklog";
import { Button, cx, IconButton, Skeleton } from "./ui";
import { HolidayBanner, HolidaysDialog } from "./WorkHolidays";

export const WORK_ALL_KEY = "/api/work/all";

/** 全部工作记录（日历、周报列表用） */
export function useWorkAll() {
  return useSWR(WORK_ALL_KEY, (url: string) => api<WorkData>(url));
}

/** 颜色深浅：记录越多越深 */
const HEAT = ["bg-field", "bg-[#13A3A3]/15", "bg-[#13A3A3]/30", "bg-[#13A3A3]/50", "bg-[#13A3A3]/75"];
export const heatClass = (count = 0) => HEAT[count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 4];

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
const WEEK_HEAD = ["一", "二", "三", "四", "五", "六", "日"];
const round = (n: number) => Math.round(n * 10) / 10;

export function WorkCalendar({
  today,
  onOpenDay,
  onOpenWeek,
}: {
  today: string;
  onOpenDay: (date: string) => void;
  onOpenWeek: (date: string) => void;
}) {
  const { data } = useWorkAll();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const stats = useMemo(() => (data ? dayStats(data) : new Map<string, DayStat>()), [data]);

  if (!data) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <Skeleton className="h-[560px] rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const days = monthGrid(month);
  const inMonth = days.filter((d) => d.startsWith(month));
  const logged = inMonth.filter((d) => stats.has(d));
  const missed = inMonth.filter((d) => isMissed(d, today, stats, data.settings));
  const hours = logged.reduce((s, d) => s + (stats.get(d)?.hours ?? 0), 0);
  const count = logged.reduce((s, d) => s + (stats.get(d)?.count ?? 0), 0);
  const totals = projectTotals(data, inMonth[0], inMonth[inMonth.length - 1]);
  const maxHours = Math.max(1, ...totals.map((t) => t.hours));
  const [y, m] = month.split("-").map(Number);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <section aria-label="月历" className="rounded-xl border border-line bg-surface p-3 md:p-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-3">
            <div className="flex items-center gap-1">
              <IconButton label="上个月" onClick={() => setMonth(shiftMonth(month, -1))}>
                <ChevronLeft size={18} />
              </IconButton>
              <h2 className="min-w-[104px] text-center text-base font-semibold tabular-nums">
                {y}年{m}月
              </h2>
              <IconButton label="下个月" onClick={() => setMonth(shiftMonth(month, 1))}>
                <ChevronRight size={18} />
              </IconButton>
              <Button
                size="sm"
                variant="ghost"
                disabled={month === today.slice(0, 7)}
                onClick={() => setMonth(today.slice(0, 7))}
              >
                本月
              </Button>
            </div>
            <p className="text-[13px] text-muted md:ml-auto">
              工作 {logged.length} 天 · {count} 条 · {round(hours)} 小时
              {missed.length > 0 && <span className="text-warn-text"> · 漏写 {missed.length} 天</span>}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setHolidaysOpen(true)}>
              <CalendarCog size={14} />
              节假日
            </Button>
          </div>
          <div className="px-1 pb-3 empty:hidden">
            <HolidayBanner settings={data.settings} year={Number(today.slice(0, 4))} />
          </div>

          <div className="grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] gap-1 md:grid-cols-[2.75rem_repeat(7,minmax(0,1fr))] md:gap-1.5">
            <div className="pb-1 text-center text-xs text-faint">周</div>
            {WEEK_HEAD.map((w) => (
              <div key={w} className="pb-1 text-center text-xs text-faint">
                {w}
              </div>
            ))}
            {days.map((d, i) => {
              const st = stats.get(d);
              const other = !d.startsWith(month);
              const miss = !other && isMissed(d, today, stats, data.settings);
              const submitted = !!data.reports[reportKey("daily", d)]?.submittedAt;
              const special = data.settings.specialDays[d];
              const weekNo =
                i % 7 === 0 ? (
                  <button
                    key={`w${d}`}
                    type="button"
                    onClick={() => onOpenWeek(d)}
                    title={`第 ${isoWeek(d)} 周，点击查看周报`}
                    aria-label={`第 ${isoWeek(d)} 周周报`}
                    className={cx(
                      "flex cursor-pointer flex-col items-center justify-center rounded-lg text-xs text-faint tabular-nums hover:bg-hover hover:text-fg",
                      weekStart(today) === d && "font-semibold text-accent-text",
                    )}
                  >
                    <span className="text-[13px]">{isoWeek(d)}</span>
                    <span className="text-[10px] max-md:hidden">周</span>
                  </button>
                ) : null;
              return [
                weekNo,
                <button
                  key={d}
                  type="button"
                  onClick={() => onOpenDay(d)}
                  aria-label={`${md(d)} ${weekdayLabel(d)}${st ? `，${st.count} 条记录` : miss ? "，没有记录" : ""}`}
                  className={cx(
                    "relative flex h-14 cursor-pointer flex-col justify-between rounded-lg border p-1.5 text-left transition-[box-shadow] hover:ring-2 hover:ring-accent/40 md:h-[84px] md:p-2",
                    st ? cx(heatClass(st.count), "border-transparent") : "border-line bg-surface",
                    miss && "border-dashed border-warn/70",
                    other && "opacity-40",
                    d === today && "ring-2 ring-accent",
                  )}
                >
                  <span className="flex items-center gap-1">
                    <span
                      className={cx("text-[13px] tabular-nums", d === today ? "font-semibold text-accent-text" : "")}
                    >
                      {Number(d.slice(8))}
                    </span>
                    {special && (
                      <span
                        title={special.name}
                        className={cx(
                          "rounded px-1 text-[10px] leading-4",
                          special.off ? "bg-success-soft text-success-text" : "bg-warn-soft text-warn-text",
                        )}
                      >
                        {special.off ? "休" : "班"}
                      </span>
                    )}
                  </span>
                  {st ? (
                    <span className="text-[11px] leading-4 text-fg/80 md:text-xs">
                      {st.count} 条<span className="max-md:hidden"> · {round(st.hours)}h</span>
                      {!submitted && d <= today && <span className="block text-warn-text max-md:hidden">未提交</span>}
                    </span>
                  ) : (
                    (miss && <span className="text-[11px] leading-4 text-warn-text max-md:hidden">未记录</span>) ||
                    (special?.off && special.name && (
                      <span className="truncate text-[11px] leading-4 text-faint max-md:hidden">{special.name}</span>
                    ))
                  )}
                  {submitted ? (
                    <CircleCheck
                      size={14}
                      aria-label="日报已提交"
                      className="absolute top-1.5 right-1.5 text-success md:top-2 md:right-2"
                    />
                  ) : (
                    !!st?.undone && (
                      <span
                        title={`${st.undone} 条未完成`}
                        className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-warn md:top-2 md:right-2"
                      />
                    )
                  )}
                </button>,
              ];
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-3 text-xs text-faint">
            <span className="flex items-center gap-1">
              少
              {[1, 3, 5, 7].map((n) => (
                <span key={n} className={cx("size-3 rounded-sm", heatClass(n))} />
              ))}
              多
            </span>
            <span className="flex items-center gap-1">
              <span className="size-3 rounded-sm border border-dashed border-warn/70" />
              工作日没有记录
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-warn" />
              有未完成的事
            </span>
            <span className="flex items-center gap-1">
              <CircleCheck size={12} className="text-success" />
              日报已提交
            </span>
            <span className="flex items-center gap-1">
              <span className="rounded bg-success-soft px-1 text-[10px] leading-4 text-success-text">休</span>
              <span className="rounded bg-warn-soft px-1 text-[10px] leading-4 text-warn-text">班</span>
              放假 / 补班
            </span>
            <span className="max-md:hidden">点日期看日报，点左边的周次看周报</span>
          </div>
        </section>

        <section aria-label="本月项目" className="rounded-xl border border-line bg-surface p-4 md:p-5">
          <h2 className="text-base font-semibold">本月在做什么</h2>
          <p className="mt-0.5 text-[13px] text-muted">按工时排序</p>
          {totals.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-faint">这个月还没有记录</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3.5">
              {totals.map((t) => (
                <li key={t.projectId ?? "none"} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: projectColor(t.projectId) }} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.name}</span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {round(t.hours)} 小时 · {t.count} 条
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-field">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(t.hours / maxHours) * 100}%`, background: projectColor(t.projectId) }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <HolidaysDialog
        open={holidaysOpen}
        onClose={() => setHolidaysOpen(false)}
        settings={data.settings}
        year={Number(month.slice(0, 4))}
      />
      <YearHeatmap year={Number(today.slice(0, 4))} stats={stats} onOpenDay={onOpenDay} today={today} />
    </div>
  );
}

/** 全年热力图：一列是一周，一格是一天 */
function YearHeatmap({
  year: initialYear,
  stats,
  today,
  onOpenDay,
}: {
  year: number;
  stats: Map<string, DayStat>;
  today: string;
  onOpenDay: (date: string) => void;
}) {
  const [year, setYear] = useState(initialYear);
  const first = weekStart(`${year}-01-01`);
  const weeks: string[][] = [];
  for (let w = first; w <= `${year}-12-31`; w = shiftDate(w, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => shiftDate(w, i)));
  }
  const inYear = [...stats.entries()].filter(([d]) => d.startsWith(String(year)));
  const total = inYear.reduce((s, [, st]) => s + st.count, 0);

  return (
    <section aria-label={`${year} 年`} className="rounded-xl border border-line bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-3">
        <div className="flex items-center gap-1">
          <IconButton label="上一年" size="sm" onClick={() => setYear(year - 1)}>
            <ChevronLeft size={16} />
          </IconButton>
          <h2 className="text-base font-semibold tabular-nums">{year} 年</h2>
          <IconButton label="下一年" size="sm" onClick={() => setYear(year + 1)}>
            <ChevronRight size={16} />
          </IconButton>
        </div>
        <p className="text-[13px] text-muted md:ml-auto">
          全年工作 {inYear.length} 天 · {total} 条记录
        </p>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-[3px] pl-6 text-[11px] text-faint">
            {weeks.map((w, i) => {
              // 每个月第一周的上方写月份
              const month = w.find((d) => d.endsWith("-01") || d === `${year}-01-01`);
              const label = month && month.startsWith(String(year)) ? `${Number(month.slice(5, 7))}月` : "";
              return (
                <span key={i} className="w-[11px] shrink-0 overflow-visible whitespace-nowrap">
                  {label}
                </span>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            <div className="flex w-5 shrink-0 flex-col gap-[3px] text-[10px] leading-[11px] text-faint">
              {["一", "", "三", "", "五", "", ""].map((w, i) => (
                <span key={i} className="h-[11px]">
                  {w}
                </span>
              ))}
            </div>
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {w.map((d) => {
                  const st = stats.get(d);
                  const out = !d.startsWith(String(year));
                  return (
                    <button
                      key={d}
                      type="button"
                      title={`${md(d)} ${weekdayLabel(d)}${st ? ` · ${st.count} 条` : ""}`}
                      aria-label={`${md(d)}${st ? `，${st.count} 条记录` : ""}`}
                      onClick={() => onOpenDay(d)}
                      disabled={out}
                      className={cx(
                        "size-[11px] cursor-pointer rounded-[2px] hover:ring-1 hover:ring-accent disabled:invisible",
                        heatClass(st?.count),
                        d === today && "ring-1 ring-accent",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
