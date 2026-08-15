import { notFound } from "next/navigation";
import AcquisitionLandingPage from "@/components/AcquisitionLandingPage";
import { FUNNEL_SLUGS, getAcquisitionFunnel } from "@/lib/acquisition-funnels";

export function generateStaticParams() {
  return FUNNEL_SLUGS.map((funnel) => ({ funnel }));
}

export default async function FunnelPage({ params }: { params: Promise<{ funnel: string }> }) {
  const { funnel: slug } = await params;
  const funnel = getAcquisitionFunnel(slug);
  if (!funnel) notFound();
  return <AcquisitionLandingPage funnel={funnel} />;
}
