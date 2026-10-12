/** 项目颜色按 id 自动分配，相邻创建的项目颜色不同 */
export const PROJECT_COLORS = ["#20A35A", "#F5850B", "#7B61FF", "#0E9DE5", "#13A3A3", "#E8488B", "#3D4F8F"];

/** 收件箱（未归类）的颜色，跟随深浅色模式 */
export const INBOX_COLOR = "var(--disabled)";

export function projectColor(id: number | null | undefined): string {
  if (id == null) return INBOX_COLOR;
  const n = PROJECT_COLORS.length;
  return PROJECT_COLORS[(((Math.trunc(id) - 1) % n) + n) % n];
}

/** 名称的第一个字，英文转成大写 */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "#";
}
