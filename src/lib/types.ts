export interface Group {
  id: number;
  name: string;
  sort: number;
  /** 名称的拼音，用于拼音搜索（只在 /api/data 里有） */
  py?: string;
}

export interface Project {
  id: number;
  groupId: number;
  name: string;
  description: string;
  archived: boolean;
  sort: number;
  /** 名称的拼音，用于拼音搜索（只在 /api/data 里有） */
  py?: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface Link {
  id: number;
  /** null 表示在收件箱（未分类） */
  projectId: number | null;
  title: string;
  url: string;
  note: string;
  accessCode: string;
  /** YYYY-MM-DD */
  expiresAt: string | null;
  pinned: boolean;
  favorite: boolean;
  visitCount: number;
  lastVisitedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  /** 标题和标签的拼音，用于拼音搜索（只在 /api/data 里有） */
  py?: string;
}

export type RepeatKind = "none" | "monthly" | "yearly";

/** 提醒事项，例如账号、域名、会员的到期时间 */
export interface Reminder {
  id: number;
  title: string;
  /** YYYY-MM-DD */
  dueDate: string;
  repeat: RepeatKind;
  /** 提前几天提醒，0 表示当天 */
  remindDays: number;
  /** 续费或管理地址，可以为空 */
  url: string;
  note: string;
  /** 不重复的提醒处理完后记下时间 */
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  groups: Group[];
  projects: Project[];
  tags: Tag[];
  links: Link[];
  reminders: Reminder[];
}

export interface LinkDraft {
  url: string;
  title: string;
  accessCode: string;
}
