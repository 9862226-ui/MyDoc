"use client";

import { Check, ChevronDown, CircleAlert, CircleCheck, Ellipsis, Info, LoaderCircle, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { Illustration, type IllustrationKind } from "./icons";

export { cx };
export { Avatar, DocIcon, Illustration, Logo, ProjectBadge, ProjectDot } from "./icons";

/* ---------- 按钮 ---------- */

const BUTTON_VARIANTS = {
  primary: "bg-accent font-medium text-white hover:bg-accent-hover",
  secondary: "border border-control bg-surface text-fg hover:bg-hover",
  ghost: "text-fg hover:bg-hover",
  text: "px-2 text-accent-text hover:bg-accent-soft",
  danger: "bg-danger font-medium text-white hover:bg-danger-hover",
  dangerGhost: "text-danger-text hover:bg-danger-soft",
};

const BUTTON_SIZES = {
  sm: "h-7 gap-1 px-2.5 text-[13px]",
  md: "h-8 gap-1.5 px-3.5",
  lg: "h-9 gap-1.5 px-[18px]",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  /** 显示加载圈并禁用按钮 */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "sm" | "md";
  /** outline：带边框（例如页头的「更多」按钮） */
  variant?: "ghost" | "outline";
  /** 悬停时显示提示，默认开启 */
  tooltip?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function IconButton({
  label,
  size = "md",
  variant = "ghost",
  tooltip = true,
  className,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onFocus,
  onBlur,
  ...props
}: IconButtonProps) {
  const tip = useTooltip(label);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        className={cx(
          "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40",
          size === "sm" ? "size-7" : "size-8",
          variant === "outline" && "border border-control bg-surface",
          className,
        )}
        onPointerEnter={(e) => {
          if (tooltip) tip.onPointerEnter(e);
          onPointerEnter?.(e);
        }}
        onPointerLeave={(e) => {
          tip.hide();
          onPointerLeave?.(e);
        }}
        onPointerDown={(e) => {
          tip.hide();
          onPointerDown?.(e);
        }}
        onFocus={(e) => {
          if (tooltip) tip.onFocus(e);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          tip.hide();
          onBlur?.(e);
        }}
        {...props}
      />
      {tip.node}
    </>
  );
}

/* ---------- 提示 ---------- */

/** 浮层挂载的位置：在弹窗里时挂到弹窗上（弹窗外的元素在打开弹窗时无法点击），否则挂到 body */
function overlayHost(el: Element | null | undefined): Element {
  return el?.closest("dialog[open]") ?? document.body;
}

/** 悬停 0.4 秒或键盘聚焦时显示的深色小提示 */
export function useTooltip(label: string) {
  const [anchor, setAnchor] = useState<{ rect: DOMRect; host: Element } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (el: Element) => setAnchor({ rect: el.getBoundingClientRect(), host: overlayHost(el) });

  const hide = () => {
    clearTimeout(timer.current);
    setAnchor(null);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!anchor) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [anchor]);

  return {
    hide,
    onPointerEnter(e: ReactPointerEvent<HTMLElement>) {
      if (e.pointerType !== "mouse") return;
      const el = e.currentTarget;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => el.isConnected && show(el), 400);
    },
    onFocus(e: ReactFocusEvent<HTMLElement>) {
      if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget);
    },
    node: anchor ? <TooltipBubble anchor={anchor.rect} host={anchor.host} label={label} /> : null,
  };
}

function TooltipBubble({ anchor, host, label }: { anchor: DOMRect; host: Element; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - w / 2), window.innerWidth - w - 8);
    const above = anchor.top - h - 6;
    setPos({ left, top: above >= 8 ? above : anchor.bottom + 6 });
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
      className="pointer-events-none fixed z-[70] max-w-60 rounded-md bg-[#1F2329] px-2 py-1 text-xs leading-[18px] text-white shadow-pop dark:bg-[#43464C]"
    >
      {label}
    </div>,
    host,
  );
}

/* ---------- 输入框 ---------- */

const FIELD_CLASS =
  "w-full rounded-md border border-control bg-surface px-2.5 text-fg outline-none transition-[border-color,box-shadow] placeholder:text-icon hover:border-accent/60 focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-field disabled:text-faint aria-[invalid=true]:border-danger";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input className={cx(FIELD_CLASS, "h-9", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea className={cx(FIELD_CLASS, "py-[7px]", className)} {...props} />;
}

/** 原生下拉框，换成统一的箭头样式；className 作用在外层 */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("relative inline-flex w-full", className)}>
      <select className={cx(FIELD_CLASS, "h-9 cursor-pointer appearance-none pr-8")} {...props} />
      <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-icon" />
    </span>
  );
}

/** 带放大镜图标的搜索框。filled：灰底无边框（顶栏）；outline：白底有边框（列表筛选） */
export function SearchField({
  variant = "outline",
  className,
  inputClassName,
  trailing,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  variant?: "filled" | "outline";
  inputClassName?: string;
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <label
      className={cx(
        "flex h-8 items-center gap-1.5 rounded-md px-2.5 transition-[border-color,box-shadow]",
        variant === "filled"
          ? "bg-field"
          : "border border-control bg-surface hover:border-accent/60 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
        className,
      )}
    >
      <SearchIcon size={variant === "filled" ? 16 : 14} />
      <input
        type="search"
        className={cx(
          "h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-faint",
          inputClassName,
        )}
        {...props}
      />
      {trailing}
    </label>
  );
}

function SearchIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="shrink-0 text-icon"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function Checkbox({
  indeterminate,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input ref={ref} type="checkbox" className={cx("m-0 size-[15px] shrink-0 cursor-pointer", className)} {...props} />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  as = "label",
  extra,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
  /** 内容不是单个输入框时（例如一组按钮）用 div */
  as?: "label" | "div";
  /** 标签右侧的补充内容 */
  extra?: ReactNode;
}) {
  const Tag = as;
  return (
    <Tag className={cx("flex flex-col gap-1.5", className)}>
      <span className="flex items-center justify-between gap-2 font-medium">
        {label}
        {extra}
      </span>
      {children}
      {error ? (
        <span className="text-xs text-danger-text">{error}</span>
      ) : hint ? (
        <span className="text-xs text-faint">{hint}</span>
      ) : null}
    </Tag>
  );
}

/* ---------- 展示 ---------- */

const TAG_TONES = {
  default: "bg-field text-muted",
  chip: "bg-chip text-muted",
  pin: "bg-pin text-pin-text leading-[18px] px-[5px]",
  accent: "bg-accent-soft text-accent-text",
  warn: "bg-warn-soft text-warn-text leading-[22px]",
  danger: "bg-danger-soft text-danger-text leading-[22px]",
  success: "bg-success-soft text-success-text leading-[22px]",
  outline: "border border-line-strong text-fg font-mono",
};

/** 小标签：标签、置顶、到期提醒、提取码等 */
export function Tag({
  tone = "default",
  className,
  children,
  title,
}: {
  tone?: keyof typeof TAG_TONES;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex max-w-full shrink-0 items-center rounded px-1.5 text-xs leading-5 whitespace-nowrap",
        TAG_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cx("shrink-0 animate-spin", className)} />;
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden style={style} className={cx("skeleton block h-3 rounded-md", className)} />;
}

/** Mac 上显示 ⌘，其他系统显示 Ctrl */
export function useModKey(): string {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.userAgent)) setMod("⌘");
  }, []);
  return mod;
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-kbd-line bg-kbd px-[5px] font-sans text-xs leading-none text-faint",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

const BANNER_TONES = {
  info: {
    box: "bg-accent-soft",
    icon: <Info size={16} className="shrink-0 text-accent-text" />,
    action: "text-accent-text",
  },
  warn: { box: "bg-warn-soft", icon: <AlarmIcon />, action: "text-warn-text" },
  danger: {
    box: "bg-danger-soft",
    icon: <CircleAlert size={16} className="shrink-0 text-danger" />,
    action: "text-danger-text",
  },
  success: {
    box: "bg-accent-soft",
    icon: <CircleCheck size={16} className="shrink-0 text-success" />,
    action: "text-accent-text",
  },
};

/** 页面顶部的提醒条 */
export function Banner({
  tone = "info",
  icon,
  children,
  action,
  className,
}: {
  tone?: keyof typeof BANNER_TONES;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = BANNER_TONES[tone];
  return (
    <div role="status" className={cx("flex items-center gap-2 rounded-md px-3.5 py-[9px]", t.box, className)}>
      {icon ?? t.icon}
      <span className="min-w-0 flex-1">{children}</span>
      {action && (
        <span className={cx("shrink-0 font-medium [&_a]:hover:underline [&_button]:hover:underline", t.action)}>
          {action}
        </span>
      )}
    </div>
  );
}

/** 闹钟图标（即将过期），橙色 */
export function AlarmIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--warn)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
      aria-hidden
    >
      <circle cx="12" cy="13" r="7" />
      <path d="M12 10v3l2 2M5 3 2 6M22 6l-3-3" />
    </svg>
  );
}

export function StarIcon({
  size = 14,
  filled = true,
  className,
}: {
  size?: number;
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "var(--star)" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="2"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
      aria-hidden
    >
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}

export function EmptyState({
  illustration = "links",
  icon,
  title,
  children,
  actions,
  tip,
  bordered = true,
  className,
}: {
  illustration?: IllustrationKind | null;
  /** 用小图标代替插画（用于不太重要的空状态） */
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tip?: ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center px-6 text-center",
        icon ? "py-14" : "pt-[72px] pb-16",
        bordered && "rounded-xl border border-dashed border-line-strong",
        className,
      )}
    >
      {icon ? <div className="mb-3 text-icon">{icon}</div> : illustration && <Illustration kind={illustration} />}
      <h2 className={cx("font-semibold", icon ? "text-base" : "mt-5 mb-1.5 text-lg leading-[26px]")}>{title}</h2>
      {children && <div className="max-w-[440px] text-muted">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
      {tip && <p className="mt-5 text-[13px] text-faint">{tip}</p>}
    </div>
  );
}

/* ---------- 弹窗 ---------- */

/** 基于原生 <dialog> 的弹窗；关闭时卸载内容，下次打开会重新初始化 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  bodyClassName?: string;
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
        "m-auto w-[calc(100%-24px)] overflow-hidden rounded-xl border-0 bg-menu p-0 shadow-dialog open:animate-[dialog-in_160ms_ease-out]",
        size === "sm"
          ? "max-w-[400px]"
          : size === "lg"
            ? "max-w-[720px]"
            : size === "xl"
              ? "max-w-[880px]"
              : "max-w-[560px]",
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[min(88dvh,860px)] flex-col">
          {title !== undefined && (
            <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
              <div className="min-w-0">
                <h2 className="text-[17px] leading-[26px] font-semibold">{title}</h2>
                {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
              </div>
              <IconButton label="关闭" size="sm" tooltip={false} onClick={onClose} className="-mr-1">
                <X size={18} />
              </IconButton>
            </header>
          )}
          <div className={cx("min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-2", bodyClassName)}>{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 px-6 pt-4 pb-5">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** 表单弹窗的底栏：放在表单里，滚动时固定在弹窗底部（弹窗要传 bodyClassName="pb-0"） */
export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "sticky bottom-0 z-10 -mx-6 mt-2 flex flex-wrap items-center justify-end gap-2 bg-menu px-6 pt-4 pb-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------- 下拉菜单 ---------- */

export type MenuItem =
  | {
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      danger?: boolean;
      hidden?: boolean;
      disabled?: boolean;
      /** 右侧的快捷键提示 */
      shortcut?: string;
      /** 显示对勾（用于筛选菜单） */
      checked?: boolean;
    }
  | { divider: true; hidden?: boolean }
  | { heading: string; hidden?: boolean };

export type MenuTriggerProps = {
  ref: Ref<HTMLButtonElement>;
  onClick: (e: { stopPropagation: () => void }) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
};

/** 下拉菜单，渲染到 body（或所在的弹窗）上，避免被滚动容器裁掉 */
export function Menu({
  items,
  label = "更多操作",
  icon,
  className,
  trigger,
  align = "end",
  matchWidth = false,
  menuClassName,
}: {
  items: MenuItem[];
  label?: string;
  icon?: ReactNode;
  className?: string;
  /** 自定义触发按钮；不传时显示「⋯」图标按钮 */
  trigger?: (props: MenuTriggerProps) => ReactNode;
  /** 菜单与按钮的哪一侧对齐 */
  align?: "start" | "end";
  /** 菜单和按钮一样宽 */
  matchWidth?: boolean;
  menuClassName?: string;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);

  const close = (focusButton = false) => {
    setAnchor(null);
    setPos(null);
    if (focusButton) btnRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const m = menuRef.current;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    let left = align === "start" ? anchor.left : anchor.right - w;
    left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
    const below = anchor.bottom + 4;
    const top = below + h > window.innerHeight - 8 && anchor.top - h - 4 >= 8 ? anchor.top - h - 4 : below;
    setPos({ left, top });
  }, [anchor, align]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // 阻止默认行为，菜单在弹窗里时只关菜单、不关弹窗
        e.preventDefault();
        e.stopPropagation();
        close(true);
      } else if (e.key === "Tab") {
        close();
      }
    };
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    const onResize = () => close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [anchor]);

  useEffect(() => {
    if (pos) menuRef.current?.querySelector<HTMLButtonElement>("[role^=menuitem]:not(:disabled)")?.focus();
  }, [pos]);

  const toggle = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (anchor) close();
    else setAnchor(btnRef.current!.getBoundingClientRect());
  };

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = [...menuRef.current!.querySelectorAll<HTMLButtonElement>("[role^=menuitem]:not(:disabled)")];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % buttons.length;
    else if (e.key === "ArrowUp") next = (i - 1 + buttons.length) % buttons.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = buttons.length - 1;
    if (next < 0) return;
    e.preventDefault();
    buttons[next]?.focus();
  };

  const triggerProps: MenuTriggerProps = {
    ref: btnRef,
    onClick: toggle,
    "aria-haspopup": "menu",
    "aria-expanded": !!anchor,
  };
  const hasChecks = visible.some((i) => "checked" in i && i.checked !== undefined);

  return (
    <>
      {trigger ? (
        trigger(triggerProps)
      ) : (
        <IconButton label={label} className={className} tooltip={!anchor} {...triggerProps}>
          {icon ?? <Ellipsis size={16} />}
        </IconButton>
      )}
      {anchor &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKey}
            style={{
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: pos ? undefined : "hidden",
              width: matchWidth ? anchor.width : undefined,
            }}
            className={cx(
              "fixed z-50 max-h-[min(420px,calc(100dvh-16px))] min-w-40 overflow-y-auto rounded-lg border border-line-strong bg-menu p-1 shadow-pop",
              menuClassName,
            )}
          >
            {visible.map((item, i) =>
              "divider" in item ? (
                <div key={i} role="separator" className="mx-1.5 my-1 h-px bg-line" />
              ) : "heading" in item ? (
                <div key={i} className="px-2.5 pt-1.5 pb-1 text-xs text-faint">
                  {item.heading}
                </div>
              ) : (
                <button
                  key={i}
                  type="button"
                  role={item.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
                  aria-checked={item.checked}
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    close(true);
                    item.onSelect();
                  }}
                  className={cx(
                    "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left whitespace-nowrap outline-none hover:bg-hover focus-visible:bg-hover disabled:cursor-not-allowed disabled:opacity-50",
                    item.danger ? "text-danger-text" : "text-fg",
                  )}
                >
                  {item.icon && (
                    <span
                      className={cx(
                        "flex w-4 shrink-0 justify-center",
                        item.danger ? "text-danger-text" : "text-muted",
                      )}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.shortcut && <span className="text-xs text-faint">{item.shortcut}</span>}
                  {hasChecks && (
                    <Check size={15} className={cx("shrink-0 text-accent-text", !item.checked && "invisible")} />
                  )}
                </button>
              ),
            )}
          </div>,
          overlayHost(btnRef.current),
        )}
    </>
  );
}

/** 灰底的筛选下拉按钮，例如「来源：全部 ▾」 */
export function FilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode; hidden?: boolean }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const active = value !== options[0]?.value;
  return (
    <Menu
      label={label}
      align="start"
      items={options.map((o) => ({
        label: o.label,
        icon: o.icon,
        hidden: o.hidden,
        checked: o.value === value,
        onSelect: () => onChange(o.value),
      }))}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={cx(
            "inline-flex h-8 max-w-60 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2.5 transition-colors",
            active ? "bg-accent-soft text-accent-text" : "bg-field text-fg hover:bg-chip",
            className,
          )}
        >
          <span className="truncate">
            {label}：{current?.label}
          </span>
          <ChevronDown size={14} className={cx("shrink-0", active ? "text-accent-text" : "text-icon")} />
        </button>
      )}
    />
  );
}

/* ---------- 切换 ---------- */

/** 下划线样式的标签页 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  label?: string;
}) {
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = items.findIndex((t) => t.value === value);
    const next = items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
    onChange(next.value);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cx("flex gap-6", className)}>
      {items.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            data-value={t.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cx(
              "h-11 shrink-0 cursor-pointer text-[15px] transition-colors",
              selected ? "font-semibold text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "text-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1 text-[13px] font-normal text-faint">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 灰底分段按钮，例如列表 / 卡片视图切换 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cx("flex shrink-0 rounded-md bg-field p-0.5", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-label={o.label}
            title={o.label}
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cx(
              "flex size-7 cursor-pointer items-center justify-center rounded transition-colors",
              selected
                ? "bg-surface text-fg shadow-[0_1px_2px_var(--shadow)] dark:bg-chip"
                : "text-muted hover:text-fg",
            )}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- 轻提示 ---------- */

export type ToastTone = "success" | "error" | "info";

const TOAST_ICONS: Record<ToastTone, ReactNode> = {
  success: <CircleCheck size={16} className="shrink-0 text-success" />,
  error: <CircleAlert size={16} className="shrink-0 text-danger" />,
  info: <Info size={16} className="shrink-0 text-accent-text" />,
};

/** 轻提示卡片（白底、带图标，可带一个操作按钮，例如「撤销」） */
export function ToastCard({
  tone = "success",
  message,
  action,
  onClose,
}: {
  tone?: ToastTone;
  message: ReactNode;
  action?: { label: string; onClick: () => void };
  onClose?: () => void;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="pointer-events-auto flex max-w-[calc(100vw-32px)] items-center gap-2 rounded-lg border border-line-strong bg-menu py-2.5 pr-2 pl-3.5 shadow-pop animate-[toast-in_180ms_ease-out]"
    >
      {TOAST_ICONS[tone]}
      <span className="min-w-0 flex-1">{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 cursor-pointer rounded px-1.5 font-medium text-accent-text hover:bg-accent-soft"
        >
          {action.label}
        </button>
      )}
      {onClose && (
        <button
          type="button"
          aria-label="关闭提示"
          onClick={onClose}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-icon hover:bg-hover hover:text-fg"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
