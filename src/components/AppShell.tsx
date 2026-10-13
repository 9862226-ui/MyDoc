"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { refreshData } from "@/lib/client";
import { parseShareText } from "@/lib/share-text";
import type { Group, Link, Project, Reminder } from "@/lib/types";
import { CommandPalette } from "./CommandPalette";
import { AiOrganizeDialog, autoClassify, useAiSettings } from "./AiOrganize";
import { AddTagsDialog, ConfirmDialog, GroupDialog, ProjectDialog } from "./dialogs";
import { HelpDialog } from "./HelpDialog";
import { ImportDialog } from "./ImportDialog";
import { LinkDialog } from "./LinkDialog";
import { ReminderDialog } from "./Reminders";
import { ShareDialog } from "./ShareDialog";
import { Sidebar } from "./Sidebar";
import { MobileHeader, TabBar, TopBar } from "./Topbar";
import { ToastCard } from "./ui";
import { UIContext, type ConfirmOptions, type LinkInit, type ToastOptions, type UI } from "./ui-context";

interface Toast extends ToastOptions {
  id: number;
  message: string;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** 除了搜索框以外，是否有弹窗开着 */
function dialogOpen(): boolean {
  return !!document.querySelector("dialog[open]:not([data-palette])");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; link?: Link; init?: LinkInit }>({ open: false });
  const [importDialog, setImportDialog] = useState<{ open: boolean; text?: string }>({ open: false });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; group?: Group }>({ open: false });
  const [projectDialog, setProjectDialog] = useState<{ open: boolean; project?: Project; groupId?: number }>({
    open: false,
  });
  const [reminderDialog, setReminderDialog] = useState<{ open: boolean; reminder?: Reminder }>({ open: false });
  const [shareTarget, setShareTarget] = useState<Project | null>(null);
  const [aiIds, setAiIds] = useState<number[] | null>(null);
  const { data: ai } = useAiSettings();
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const uiRef = useRef<UI | null>(null);
  const [tagTarget, setTagTarget] = useState<{ ids: number[]; done?: () => void } | null>(null);
  const [confirmState, setConfirmState] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(
    null,
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const toastId = useRef(0);

  const projectMatch = pathname.match(/^\/p\/(\d+)/);
  const defaultProjectId = projectMatch ? Number(projectMatch[1]) : null;

  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, message, ...options }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), options.action ? 6000 : 3000);
  }, []);

  const ui: UI = useMemo(
    () => ({
      addLink: (init) => setLinkDialog({ open: true, init }),
      editLink: (link) => setLinkDialog({ open: true, link }),
      importLinks: (init) => setImportDialog({ open: true, text: init?.text }),
      openPalette: () => setPaletteOpen(true),
      editGroup: (group) => setGroupDialog({ open: true, group }),
      editProject: (project, groupId) => setProjectDialog({ open: true, project, groupId }),
      addTagsTo: (ids, done) => setTagTarget({ ids, done }),
      editReminder: (reminder) => setReminderDialog({ open: true, reminder }),
      shareProject: (project) => setShareTarget(project),
      organizeWithAi: (ids) => setAiIds(ids),
      linkAdded: (link) => {
        const s = aiRef.current;
        if (link.projectId !== null || !s?.ready || !s.config.autoClassify) return;
        void refreshData().then((data) => data && uiRef.current && autoClassify(uiRef.current, data, link.id));
      },
      confirm: (options) => new Promise<boolean>((resolve) => setConfirmState({ options, resolve })),
      toast,
      defaultProjectId,
    }),
    [toast, defaultProjectId],
  );
  uiRef.current = ui;

  // 快捷键：Ctrl/⌘+K 或 / 搜索，N 添加链接
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (dialogOpen()) return;
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setLinkDialog({ open: true });
      }
    };
    // 在页面空白处粘贴链接，直接打开添加窗口
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || document.querySelector("dialog[open]")) return;
      const text = e.clipboardData?.getData("text") ?? "";
      const items = parseShareText(text);
      if (!items.length) return;
      e.preventDefault();
      if (items.length === 1) setLinkDialog({ open: true, init: { ...items[0], pasted: true } });
      else setImportDialog({ open: true, text });
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  return (
    <UIContext.Provider value={ui}>
      <div className="flex h-dvh">
        {/* 桌面端侧边栏；手机端用底部标签栏，项目列表在「项目」页 */}
        <aside className="hidden w-60 shrink-0 border-r border-line md:block">
          <Sidebar />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onHelp={() => setHelpOpen(true)} />
          <main
            id="main"
            className="min-h-0 flex-1 overflow-y-auto pb-[calc(96px+env(safe-area-inset-bottom))] md:pb-0"
          >
            <MobileHeader />
            {children}
          </main>
        </div>
        <TabBar />
      </div>

      <LinkDialog
        open={linkDialog.open}
        link={linkDialog.link}
        init={linkDialog.init}
        onClose={() => setLinkDialog({ open: false })}
      />
      <ImportDialog
        open={importDialog.open}
        initialText={importDialog.text}
        onClose={() => setImportDialog({ open: false })}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <GroupDialog open={groupDialog.open} group={groupDialog.group} onClose={() => setGroupDialog({ open: false })} />
      <ProjectDialog
        open={projectDialog.open}
        project={projectDialog.project}
        groupId={projectDialog.groupId}
        onClose={() => setProjectDialog({ open: false })}
      />
      <ReminderDialog
        open={reminderDialog.open}
        reminder={reminderDialog.reminder}
        onClose={() => setReminderDialog({ open: false })}
      />
      <ShareDialog project={shareTarget} onClose={() => setShareTarget(null)} />
      <AiOrganizeDialog ids={aiIds} onClose={() => setAiIds(null)} />
      <AddTagsDialog ids={tagTarget?.ids ?? null} onDone={tagTarget?.done} onClose={() => setTagTarget(null)} />
      <ConfirmDialog
        options={confirmState?.options ?? null}
        onResult={(ok) => {
          confirmState?.resolve(ok);
          setConfirmState(null);
        }}
      />

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 md:top-4"
      >
        {toasts.map((t) => (
          <ToastCard
            key={t.id}
            tone={t.kind === "error" ? "error" : t.kind === "info" ? "info" : "success"}
            message={t.message}
            action={
              t.action && {
                label: t.action.label,
                onClick: () => {
                  t.action!.onClick();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                },
              }
            }
          />
        ))}
      </div>
    </UIContext.Provider>
  );
}
