import { extendTailwindMerge } from "tailwind-merge";

// 让 tailwind-merge 认识自定义的颜色和阴影，避免把 text-xs 和 text-muted 当成冲突
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "bg", "side", "surface", "menu", "line", "line-soft", "line-strong", "control", "fg", "muted", "faint", "icon",
        "disabled", "field", "chip", "hover", "nav-hover", "accent", "accent-hover", "accent-soft", "accent-text",
        "accent-fg", "pin", "pin-text", "warn", "warn-soft", "warn-text", "danger", "danger-hover", "danger-soft",
        "danger-text", "success", "star", "kbd", "kbd-line", "surface-2",
      ],
      shadow: ["pop", "card", "dialog"],
    },
  },
});

/** 拼接 className，后面的同类样式会覆盖前面的（例如 w-auto 覆盖 w-full） */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
