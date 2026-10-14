import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { getDb } from "@/lib/db";
import { REF_LABEL, REF_TYPES, type RefType } from "@/lib/refs";
import { resolveRef } from "@/lib/refs-repo";

/** 点正文里的引用 [[log:12|…]] 时到这里，查到对应的页面再跳过去 */
export default async function GoPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const valid = (REF_TYPES as string[]).includes(type) && /^\d+$/.test(id);
  const href = valid ? resolveRef(getDb(), type as RefType, Number(id)) : null;
  if (href) redirect(href);
  return (
    <EmptyState title={valid ? `这条${REF_LABEL[type as RefType]}已经删除了` : "引用的地址不正确"}>
      引用它的地方还留着原来的标题，可以改成别的内容
    </EmptyState>
  );
}
