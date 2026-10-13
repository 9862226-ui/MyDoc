import { aiReady, getAiConfig } from "./ai";
import { getSyncConfig } from "./backup-sync";
import type { DB } from "./db";
import { getNotifyConfig } from "./notify";
import { getSetting, setSetting } from "./settings";

/** 工作台「设置清单」：前三项自动检测，后两项检测不到，由用户手动标记完成 */
export type SetupItem = "ai" | "notify" | "backup" | "bookmarklet" | "mobile";
export const MANUAL_ITEMS = ["bookmarklet", "mobile"] as const;
export type ManualItem = (typeof MANUAL_ITEMS)[number];

interface SetupState {
  manual: Partial<Record<ManualItem, boolean>>;
  dismissed: boolean;
}

const KEY = "setup";
const DEFAULT: SetupState = { manual: {}, dismissed: false };

export interface SetupStatus {
  done: Record<SetupItem, boolean>;
  dismissed: boolean;
}

export function getSetupStatus(db: DB): SetupStatus {
  const state = getSetting(db, KEY, DEFAULT);
  const notify = getNotifyConfig(db);
  return {
    done: {
      ai: aiReady(getAiConfig(db)),
      notify: notify.enabled && !!notify.target.trim(),
      backup: getSyncConfig(db).enabled,
      bookmarklet: !!state.manual.bookmarklet,
      mobile: !!state.manual.mobile,
    },
    dismissed: state.dismissed,
  };
}

export function updateSetup(db: DB, patch: { manual?: Partial<Record<ManualItem, boolean>>; dismissed?: boolean }) {
  const state = getSetting(db, KEY, DEFAULT);
  setSetting(db, KEY, { manual: { ...state.manual, ...patch.manual }, dismissed: patch.dismissed ?? state.dismissed });
  return getSetupStatus(db);
}
