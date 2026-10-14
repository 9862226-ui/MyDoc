import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { fetchHolidays } from "@/lib/holidays";
import { importHolidays, setSpecialDay } from "@/lib/worklog-repo";

/** 导入某一年的国家法定节假日安排 */
export const POST = route(async (req) => {
  const { year } = await readJson(req, z.object({ year: z.number().int().min(2020).max(2100) }));
  try {
    return importHolidays(getDb(), year, await fetchHolidays(year));
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});

/** 手动设置某天：off 休息日 / work 补班日 / null 恢复默认 */
export const PUT = route(async (req) => {
  const { date, mode } = await readJson(
    req,
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式不正确"),
      mode: z.enum(["off", "work"]).nullable(),
    }),
  );
  return setSpecialDay(getDb(), date, mode);
});
