import { LinksView } from "@/components/LinksView";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  return <LinksView key={id} view={{ kind: "project", id }} />;
}
