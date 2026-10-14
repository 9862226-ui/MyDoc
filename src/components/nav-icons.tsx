import {
  AlarmClock,
  Bell,
  Quote,
  Clock,
  FolderPlus,
  Inbox,
  Layers,
  LayoutDashboard,
  NotebookPen,
  Link2,
  Rows2,
  Star,
  Trash2,
  Upload,
  UserRound,
  Folder,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  home: LayoutDashboard,
  inbox: Inbox,
  star: Star,
  alarm: AlarmClock,
  bell: Bell,
  quote: Quote,
  work: NotebookPen,
  layers: Layers,
  clock: Clock,
  trash: Trash2,
  link: Link2,
  import: Upload,
  folder: Folder,
  folderPlus: FolderPlus,
  group: Rows2,
  user: UserRound,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof ICONS;

/** 导航和菜单里用的线性图标（16px） */
export function NavIcon({ name, size = 16, className }: { name: NavIconName; size?: number; className?: string }) {
  const Icon = ICONS[name];
  return <Icon size={size} strokeWidth={2} className={className} aria-hidden />;
}
