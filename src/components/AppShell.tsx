"use client";

import { Menu as MenuIcon, Plus, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { parseShareText } from "@/lib/share-text";
import type { Group, Link, Project } from "@/lib/types";
import { CommandPalette } from "./CommandPalette";
import { AddTagsDialog, ConfirmDialog, GroupDialog, ProjectDialog } from "./dialogs";
import { ImportDialog } from "./ImportDialog";
import { LinkDialog } from "./LinkDialog";
import { Sidebar } from "./Sidebar";
import { cx, IconButton } from "./ui";
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
  const [tagTarget, setTagTarget] = useState<{ ids: number[]; done?: () => void } | null>(null);
  const [confirmState, setConfirmState] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(
    null,
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
      confirm: (options) => new Promise<boolean>((resolve) => setConfirmState({ options, resolve })),
      toast,
      defaultProjectId,
    }),
    [toast, defaultProjectId],
  );

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
      if (items.length === 1) setLinkDialog({ open: true, init: items[0] });
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
        {/* 桌面端侧边栏 */}
        <aside className="hidden w-64 shrink-0 border-r border-line md:block">
          <Sidebar />
        </aside>

        {/* 手机端抽屉 */}
        <div className={cx("fixed inset-0 z-40 md:hidden", !drawerOpen && "pointer-events-none")}>
          <div
            className={cx("absolute inset-0 bg-black/40 transition-opacity", drawerOpen ? "opacity-100" : "opacity-0")}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className={cx(
              "absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl transition-transform",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-20 flex items-center gap-1 border-b border-line bg-surface/90 px-2 py-1.5 backdrop-blur md:hidden">
            <IconButton label="菜单" onClick={() => setDrawerOpen(true)}>
              <MenuIcon size={18} />
            </IconButton>
            <span className="flex-1 font-semibold">MyDoc</span>
            <IconButton label="搜索" onClick={() => setPaletteOpen(true)}>
              <Search size={18} />
            </IconButton>
            <IconButton label="添加链接" onClick={() => setLinkDialog({ open: true })}>
              <Plus size={18} />
            </IconButton>
          </div>
          {children}
        </main>
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
      <AddTagsDialog ids={tagTarget?.ids ?? null} onDone={tagTarget?.done} onClose={() => setTagTarget(null)} />
      <ConfirmDialog
        options={confirmState?.options ?? null}
        onResult={(ok) => {
          confirmState?.resolve(ok);
          setConfirmState(null);
        }}
      />

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-2.5 text-[13px] shadow-lg",
              t.kind === "error" ? "bg-danger text-white" : "bg-fg text-bg",
            )}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </UIContext.Provider>
  );
}
