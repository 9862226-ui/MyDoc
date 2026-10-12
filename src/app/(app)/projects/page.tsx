import { Sidebar } from "@/components/Sidebar";

/** 手机端的「项目」标签页：分组、项目和标签 */
export default function ProjectsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl md:py-6">
      <Sidebar variant="page" />
    </div>
  );
}
