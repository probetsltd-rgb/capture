import { EngageKnowledgeView } from "@/components/engage/knowledge/EngageKnowledgeView";

export default async function AdminEngageKnowledgePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return (
    <EngageKnowledgeView businessId={businessId} backHref={`/admin/engage/${businessId}`} backLabel="← Back to Engage" />
  );
}
