export interface Group {
  id: number;
  name: string;
  sort: number;
}

export interface Project {
  id: number;
  groupId: number;
  name: string;
  description: string;
  archived: boolean;
  sort: number;
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
}

export interface AppData {
  groups: Group[];
  projects: Project[];
  tags: Tag[];
  links: Link[];
}

export interface LinkDraft {
  url: string;
  title: string;
  accessCode: string;
}
