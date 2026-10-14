import { Suspense } from "react";
import { WorkView } from "@/components/WorkLog";

export default function WorkPage() {
  // WorkView 读地址里的 ?date=（从搜索结果跳过来时打开那一天），需要包一层 Suspense
  return (
    <Suspense>
      <WorkView />
    </Suspense>
  );
}
