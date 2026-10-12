"use client";

import { Ellipsis, LoaderCircle, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { twMerge } from "tailwind-merge";
import { detectPlatform } from "@/lib/platforms";

/** 拼接 className，后面的同类样式会覆盖前面的（例如 w-auto 覆盖 w-full） */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}

const BUTTON_VARIANTS = {
  primary: "bg-accent text-accent-fg shadow-sm hover:brightness-110",
  secondary: "border border-line bg-surface hover:bg-surface-2",
  ghost: "hover:bg-surface-2",
  danger: "bg-danger text-white shadow-sm hover:brightness-110",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: "sm" | "md";
  ref?: Ref<HTMLButtonElement>;
};

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; ref?: Ref<HTMLButtonElement> };

export function IconButton({ label, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

const FIELD_CLASS =
  "w-full rounded-lg border border-line bg-surface px-3 outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input className={cx(FIELD_CLASS, "h-9", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea className={cx(FIELD_CLASS, "py-2", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(FIELD_CLASS, "h-9 pr-8 pl-2.5", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cx("animate-spin", className)} />;
}

/** Mac 上显示 ⌘，其他系统显示 Ctrl */
export function useModKey(): string {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.userAgent)) setMod("⌘");
  }, []);
  return mod;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-sans text-[11px] text-muted">
      {children}
    </kbd>
  );
}

export function PlatformIcon({ url, size = 28 }: { url: string; size?: number }) {
  const p = detectPlatform(url);
  return (
    <span
      aria-hidden
      title={p.name}
      className="inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white select-none"
      style={{
        background: p.color,
        width: size,
        height: size,
        fontSize: p.short.length > 1 ? size * 0.36 : size * 0.48,
      }}
    >
      {p.short}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-3 text-muted">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-[13px] text-muted">{children}</div>}
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** 基于原生 <dialog> 的弹窗；关闭时卸载内容，下次打开会重新初始化 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // 关闭状态的 <dialog> 里元素无法聚焦，所以 autoFocus 无效，打开后再手动聚焦
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => (downOnBackdrop.current = e.target === ref.current)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto w-[calc(100%-1.5rem)] overflow-hidden rounded-xl border border-line bg-surface p-0 shadow-2xl",
        size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-3xl" : "max-w-lg",
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[min(88dvh,820px)] flex-col">
          {title !== undefined && (
            <header className="flex items-center justify-between gap-2 border-b border-line py-2.5 pr-2.5 pl-5">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <IconButton label="关闭" onClick={onClose}>
                <X size={18} />
              </IconButton>
            </header>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex items-center gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export type MenuItem =
  | { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; hidden?: boolean }
  | { divider: true; hidden?: boolean };

/** 「更多」下拉菜单，渲染到 body 上避免被滚动容器裁掉（不要在弹窗里使用） */
export function Menu({
  items,
  label = "更多操作",
  icon,
  className,
}: {
  items: MenuItem[];
  label?: string;
  icon?: ReactNode;
  className?: string;
}) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);

  const open = () => {
    const r = btnRef.current!.getBoundingClientRect();
    const height = visible.length * 34 + 12;
    const right = Math.max(8, window.innerWidth - r.right);
    setPos(
      r.bottom + height > window.innerHeight - 8 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right },
    );
  };

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = [...menuRef.current!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <>
      <IconButton
        ref={btnRef}
        label={label}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) setPos(null);
          else open();
        }}
      >
        {icon ?? <Ellipsis size={16} />}
      </IconButton>
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onKeyDown={onMenuKey}
            style={{ position: "fixed", ...pos }}
            className="z-50 min-w-40 rounded-lg border border-line bg-surface p-1 shadow-lg"
          >
            {visible.map((item, i) =>
              "divider" in item ? (
                <div key={i} className="my-1 h-px bg-line" />
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPos(null);
                    item.onSelect();
                  }}
                  className={cx(
                    "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] outline-none hover:bg-surface-2 focus:bg-surface-2",
                    item.danger && "text-danger",
                  )}
                >
                  <span className="flex w-4 justify-center opacity-80">{item.icon}</span>
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
