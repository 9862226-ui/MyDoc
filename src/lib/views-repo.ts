import type { DB } from "./db";
import { HttpError } from "./errors";
import { getSetting, setSetting } from "./settings";
import { MAX_VIEWS, sameHref, type SavedView, type ViewKind } from "./views";

const KEY = "savedViews";

export const listViews = (db: DB): SavedView[] => getSetting(db, KEY, { views: [] as SavedView[] }).views;

/** 保存一个视图；同样的地址已经存过时改个名字 */
export function addView(db: DB, v: { name: string; href: string; kind: ViewKind }): SavedView[] {
  const views = listViews(db);
  const same = views.find((x) => sameHref(x.href, v.href));
  if (same) same.name = v.name;
  else {
    if (views.length >= MAX_VIEWS) throw new HttpError(400, `最多保存 ${MAX_VIEWS} 个视图，先删掉一些不用的`);
    views.push({ id: Math.random().toString(36).slice(2, 10), ...v });
  }
  setSetting(db, KEY, { views });
  return views;
}

/** 整体替换（改名、删除、排序） */
export function setViews(db: DB, views: SavedView[]): SavedView[] {
  setSetting(db, KEY, { views: views.slice(0, MAX_VIEWS) });
  return listViews(db);
}
