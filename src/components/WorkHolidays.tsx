"use client";

import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client";
import { weekdayLabel, type WorkSettings } from "@/lib/worklog";
import { Banner, Button, cx, Dialog, IconButton, Input } from "./ui";
import { useUI } from "./ui-context";
import { refreshWork } from "./work-ui";

/** 导入国家法定节假日；成功后刷新 */
export function useImportHolidays() {
  const ui = useUI();
  const [busy, setBusy] = useState<number | null>(null);
  const run = async (year: number) => {
    setBusy(year);
    try {
      const s = await api<WorkSettings>("/api/work/holidays", { body: { year } });
      await refreshWork();
      const n = Object.keys(s.specialDays).filter((d) => d.startsWith(`${year}-`)).length;
      ui.toast(`已导入 ${year} 年的节假日安排（${n} 天）`);
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
    setBusy(null);
  };
  return { busy, run };
}

/** 日历上方的提示：今年的节假日还没导入 */
export function HolidayBanner({ settings, year }: { settings: WorkSettings; year: number }) {
  const imp = useImportHolidays();
  if (settings.holidayYears.includes(year)) return null;
  return (
    <Banner
      action={
        <button
          type="button"
          disabled={imp.busy !== null}
          onClick={() => void imp.run(year)}
          className="cursor-pointer"
        >
          {imp.busy ? "导入中…" : `导入 ${year} 年节假日`}
        </button>
      }
    >
      日历还不知道国家法定节假日，国庆、春节会被算成「未记录」，调休补班也不会提醒
    </Banner>
  );
}

export function HolidaysDialog({
  open,
  onClose,
  settings,
  year,
}: {
  open: boolean;
  onClose: () => void;
  settings: WorkSettings;
  year: number;
}) {
  const ui = useUI();
  const imp = useImportHolidays();
  const [date, setDate] = useState("");
  const days = Object.entries(settings.specialDays)
    .filter(([d]) => d.startsWith(`${year}-`) || d.startsWith(`${year + 1}-`))
    .sort(([a], [b]) => a.localeCompare(b));

  const set = async (d: string, mode: "off" | "work" | null) => {
    try {
      await api("/api/work/holidays", { method: "PUT", body: { date: d, mode } });
      await refreshWork();
      if (mode) setDate("");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="节假日和补班"
      description="日历、日报列表的「漏记」和下班提醒，都按这里判断哪天要上班"
      footer={<Button onClick={onClose}>完成</Button>}
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h3 className="text-[13px] font-medium">国家法定节假日</h3>
          <div className="flex flex-wrap gap-2">
            {[year, year + 1].map((y) => (
              <Button key={y} size="sm" loading={imp.busy === y} onClick={() => void imp.run(y)}>
                {imp.busy !== y && <Download size={14} />}
                {settings.holidayYears.includes(y) ? `重新导入 ${y} 年` : `导入 ${y} 年`}
              </Button>
            ))}
          </div>
          <p className="text-xs text-faint">
            数据来自开源项目 holiday-cn（按国务院公告整理），每年 11 月左右公布下一年的安排。手动设置过的日子不会被覆盖
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-[13px] font-medium">手动设置</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              aria-label="日期"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
            />
            <Button size="sm" disabled={!date} onClick={() => void set(date, "off")}>
              设为休息日
            </Button>
            <Button size="sm" disabled={!date} onClick={() => void set(date, "work")}>
              设为补班日
            </Button>
          </div>
          <p className="text-xs text-faint">比如公司额外放假、年假，或者周末加班</p>
        </section>

        <section className="flex flex-col gap-1">
          <h3 className="text-[13px] font-medium">
            {year} ~ {year + 1} 年 · {days.length} 天
          </h3>
          {days.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-faint">还没有设置</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto rounded-lg border border-line">
              {days.map(([d, v]) => (
                <li key={d} className="flex items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0">
                  <span className="w-[120px] text-[13px] tabular-nums">
                    {d} {weekdayLabel(d)}
                  </span>
                  <span
                    className={cx(
                      "rounded px-1.5 text-xs leading-5",
                      v.off ? "bg-success-soft text-success-text" : "bg-warn-soft text-warn-text",
                    )}
                  >
                    {v.off ? "休" : "班"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                    {v.name}
                    {v.manual && "（手动）"}
                  </span>
                  <IconButton label="删除" size="sm" onClick={() => void set(d, null)}>
                    <Trash2 size={14} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}
