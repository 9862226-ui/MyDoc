import { LinksView } from "@/components/LinksView";
import { safeDecode } from "@/lib/url";

export default async function TagPage({ params }: { params: Promise<{ name: string }> }) {
  const name = safeDecode((await params).name);
  return <LinksView key={name} view={{ kind: "tag", name }} />;
}
