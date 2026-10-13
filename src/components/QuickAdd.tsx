"use client";

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LinkDialog } from "./LinkDialog";

/** 从浏览器收藏按钮打开时：保存或取消后，弹出的小窗口自动关闭；在普通标签页里则回到工作台 */
export function QuickAdd({
  url,
  title,
  note,
  accessCode = "",
}: {
  url: string;
  title: string;
  note: string;
  accessCode?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(false);
  // onSaved 和 onClose 在同一次点击里先后调用，用 ref 拿到最新的保存结果
  const savedRef = useRef(false);

  const finish = (wasSaved: boolean) => {
    setOpen(false);
    const isPopup = !!window.opener && window.name === "mydoc";
    if (isPopup) {
      // 保存成功时停留一下，让人看到结果
      setTimeout(() => window.close(), wasSaved ? 900 : 0);
    } else {
      router.replace("/");
    }
  };

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-2 p-8 text-center text-muted">
      {saved ? (
        <>
          <CircleCheck size={40} className="text-success" />
          <p className="text-base font-medium text-fg">已收藏到 MyDoc</p>
          <p className="text-[13px]">这个窗口马上会自动关闭</p>
        </>
      ) : (
        !open && <p>已取消</p>
      )}
      <LinkDialog
        open={open}
        init={{ url, title, note, accessCode }}
        onSaved={() => {
          savedRef.current = true;
          setSaved(true);
        }}
        onClose={() => finish(savedRef.current)}
      />
    </div>
  );
}
