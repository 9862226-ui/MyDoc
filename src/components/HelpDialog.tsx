"use client";

import { Fragment } from "react";
import { Button, Dialog, Kbd, useModKey } from "./ui";

/** 快捷键列表，帮助弹窗和设置页共用 */
export function ShortcutList() {
  const mod = useModKey();
  const rows: [string[][], string][] = [
    [[[mod, "K"], ["/"]], "打开搜索"],
    [[["N"]], "添加链接"],
    [[[mod, "V"]], "在页面空白处粘贴链接或分享文案，直接添加"],
    [[["↑"], ["↓"]], "在搜索结果里上下选择"],
    [[["Enter"]], "打开选中的链接"],
    [[[mod, "Enter"]], "在添加 / 编辑窗口里保存"],
    [[["Esc"]], "关闭窗口，或取消多选"],
  ];
  return (
    <dl className="divide-y divide-line-soft">
      {rows.map(([combos, desc]) => (
        <div key={desc} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="text-muted">{desc}</dt>
          <dd className="flex shrink-0 items-center gap-1.5 text-xs text-faint">
            {combos.map((keys, i) => (
              <Fragment key={i}>
                {i > 0 && <span>或</span>}
                <span className="flex items-center gap-1">
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </Fragment>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="快捷键"
      description="在列表里也可以把链接拖到左侧的项目上，直接移动"
      footer={
        <Button variant="primary" onClick={onClose} data-autofocus>
          知道了
        </Button>
      }
    >
      <ShortcutList />
    </Dialog>
  );
}
