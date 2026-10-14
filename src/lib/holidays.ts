/**
 * 国家法定节假日和调休补班，数据来自开源项目 holiday-cn（按国务院公告整理）。
 * 国内服务器访问 jsDelivr 一般比 GitHub 稳定，按顺序试几个地址。
 */

export interface SpecialDay {
  /** true：休息日（放假）；false：补班日（周末上班） */
  off: boolean;
  /** 节日名称，手动添加的为「手动设置」 */
  name: string;
  manual?: boolean;
}

const SOURCES = [
  (y: number) => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
  (y: number) => `https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
  (y: number) => `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${y}.json`,
];

/** 解析 holiday-cn 的数据：{ year, days: [{ name, date, isOffDay }] } */
export function parseHolidayCn(raw: unknown, year: number): Record<string, SpecialDay> {
  const r = raw as { year?: unknown; days?: unknown };
  if (r?.year !== year || !Array.isArray(r.days)) throw new Error("节假日数据格式不对");
  const out: Record<string, SpecialDay> = {};
  for (const d of r.days as { name?: unknown; date?: unknown; isOffDay?: unknown }[]) {
    if (typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || typeof d.isOffDay !== "boolean") continue;
    out[d.date] = { off: d.isOffDay, name: typeof d.name === "string" ? d.name : "" };
  }
  if (!Object.keys(out).length) throw new Error(`还没有 ${year} 年的节假日安排（一般每年 11 月左右公布下一年的）`);
  return out;
}

export async function fetchHolidays(year: number, fetcher: typeof fetch = fetch): Promise<Record<string, SpecialDay>> {
  let lastError: unknown;
  for (const url of SOURCES) {
    try {
      const res = await fetcher(url(year), { signal: AbortSignal.timeout(10_000) });
      if (res.status === 404) throw new Error(`还没有 ${year} 年的节假日安排（一般每年 11 月左右公布下一年的）`);
      if (!res.ok) throw new Error(`下载失败（${res.status}）`);
      return parseHolidayCn(await res.json(), year);
    } catch (e) {
      lastError = e;
      if ((e as Error).message.startsWith("还没有")) throw e;
    }
  }
  throw new Error(
    `下载节假日安排失败，请检查服务器能否访问 cdn.jsdelivr.net（${(lastError as Error)?.message ?? ""}）`,
  );
}
