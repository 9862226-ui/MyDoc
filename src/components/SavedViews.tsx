"use client";

import { BookmarkPlus, ListFilter, Pencil, Trash2 } from "lucide-react";
import NextLink from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/client";
import { sameHref, type SavedView, type ViewKind } from "@/lib/views";
import { Button, cx, Dialog, Field, Input, Menu } from "./ui";
import { useUI } from "./ui-context";

export const VIEWS_KEY = "/api/views";

export function useViews() {
  return useSWR(VIEWS_KEY, (url: string) => api<SavedView[]>(url));
}

/** 「保存为视图」：把当前的筛选存下来，左边栏「视图」里一点就回来 */
export function SaveViewButton({ href, kind, defaultName }: { href: string; kind: ViewKind; defaultName: string }) {
  const ui = useUI();
  const { data: views, mutate } = useViews();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const saved = views?.find((v) => sameHref(v.href, href));
  useEffect(() => {
    if (open) setName(saved?.name ?? defaultName);
  }, [open]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await mutate(await api<SavedView[]>(VIEWS_KEY, { body: { name: name.trim(), href, kind } }), {
        revalidate: false,
      });
      setOpen(false);
      ui.toast(saved ? "已改名" : "已保存，在左边栏「视图」里可以直接打开");
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
    setBusy(false);
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="把现在的筛选条件存下来，下次一点就回来">
        <BookmarkPlus size={14} />
        {saved ? `已存为「${saved.name}」` : "保存为视图"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={saved ? "修改视图名称" : "保存为视图"}
        description="保存后在左边栏「视图」和搜索（Ctrl + K）里都能找到"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void save()}>
              保存
            </Button>
          </>
        }
      >
        <Field label="名称">
          <Input
            autoFocus
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void save();
            }}
          />
        </Field>
      </Dialog>
    </>
  );
}

/** 左边栏「视图」：保存的筛选，一点就回到那个列表；可以改名、删除 */
export function ViewList({ views }: { views: SavedView[] }) {
  return (
    <Suspense fallback={<ViewItems views={views} current="" />}>
      <ViewListWithLocation views={views} />
    </Suspense>
  );
}

function ViewListWithLocation({ views }: { views: SavedView[] }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return <ViewItems views={views} current={search ? `${pathname}?${search}` : pathname} />;
}

function ViewItems({ views, current }: { views: SavedView[]; current: string }) {
  const ui = useUI();
  const { mutate } = useViews();
  const [renaming, setRenaming] = useState<SavedView | null>(null);
  const [name, setName] = useState("");

  const save = async (next: SavedView[]) => {
    try {
      await mutate(await api<SavedView[]>(VIEWS_KEY, { method: "PUT", body: { views: next } }), { revalidate: false });
    } catch (e) {
      ui.toast((e as Error).message, { kind: "error" });
    }
  };
  const remove = (v: SavedView) => {
    const before = views;
    void save(views.filter((x) => x.id !== v.id));
    ui.toast(`已删除视图「${v.name}」`, { action: { label: "撤销", onClick: () => void save(before) } });
  };

  return (
    <>
      <ul className="flex flex-col gap-0.5">
        {views.map((v) => {
          const active = sameHref(v.href, current);
          return (
            <li key={v.id} className="group/view relative">
              <NextLink
                href={v.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-[34px] items-center gap-2.5 rounded-md px-2.5 pointer-coarse:pr-10",
                  active ? "bg-accent-soft font-medium text-accent-text" : "hover:bg-nav-hover",
                )}
              >
                <ListFilter
                  size={16}
                  className={cx("shrink-0", v.kind === "work" ? "text-[#13A3A3]" : "text-accent")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
              </NextLink>
              <span className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/view:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                <Menu
                  className="size-[26px]"
                  label="视图操作"
                  items={[
                    {
                      label: "重命名",
                      icon: <Pencil size={15} />,
                      onSelect: () => {
                        setName(v.name);
                        setRenaming(v);
                      },
                    },
                    { label: "删除视图", icon: <Trash2 size={15} />, danger: true, onSelect: () => remove(v) },
                  ]}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <Dialog
        open={!!renaming}
        onClose={() => setRenaming(null)}
        size="sm"
        title="重命名视图"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>取消</Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                if (renaming) void save(views.map((x) => (x.id === renaming.id ? { ...x, name: name.trim() } : x)));
                setRenaming(null);
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <Field label="名称">
          <Input autoFocus value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}
