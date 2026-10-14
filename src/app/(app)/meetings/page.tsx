import { Suspense } from "react";
import { MeetingsView } from "@/components/Meetings";

export default function MeetingsPage() {
  // MeetingsView 读地址里的 ?do=new（命令面板的「新建会议纪要」），需要包一层 Suspense
  return (
    <Suspense>
      <MeetingsView />
    </Suspense>
  );
}
