"use client";

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LinkDialog } from "./LinkDialog";
import { SaveAsSwitch, SnippetDialog } from "./Snippets";

/**
 * 收藏页的弹窗：从浏览器收藏按钮的小窗口打开时，保存或取消后自动关闭；在普通页面里则回到工作台。
 * 有链接时默认收藏链接，选中的文字作为备注；也可以切换成把这段文字存为摘录。没有链接时直接存为摘录。
 */
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
  const [mode, setMode] = useState<"link" | "snippet">(url ? "link" : "snippet");
  // onSaved 和 onClose 在同一次点击里先后调用，用 ref 拿到最新的保存结果
  const savedRef = useRef(false);

  const finish = (wasSaved: boolean) => {
    setOpen(false);
    const isPopup = !!window.opener && window.name === "mydoc";
    if (isPopup) {
      // 保存成功时停留一下，让人看到结果
      setTimeout(() => window.close(), wasSaved ? 900 : 0);
    } else {
      router.replace(wasSaved && mode === "snippet" ? "/snippets" : "/");
    }
  };

  const onSaved = () => {
    savedRef.current = true;
    setSaved(true);
  };
  // 有链接也有文字时才需要选择
  const switchTo = url && note ? <SaveAsSwitch mode={mode} onChange={setMode} /> : undefined;

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
      {mode === "link" ? (
        <LinkDialog
          open={open}
          init={{ url, title, note, accessCode }}
          onSaved={onSaved}
          onClose={() => finish(savedRef.current)}
          switchTo={switchTo}
        />
      ) : (
        <SnippetDialog
          open={open}
          init={{ content: note, sourceUrl: url, sourceTitle: title }}
          onSaved={onSaved}
          onClose={() => finish(savedRef.current)}
          switchTo={switchTo}
        />
      )}
    </div>
  );
}
