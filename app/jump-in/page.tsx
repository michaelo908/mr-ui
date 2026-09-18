import GravitasApp from "@/components/GravitasApp";
import { getAcquisitionFunnel } from "@/lib/acquisition-funnels";

export default async function JumpInPage({ searchParams }: { searchParams: Promise<{ funnel?: string; first_name?: string; handoff?: string }> }) {
  const query = await searchParams;
  const funnel = query.funnel ? getAcquisitionFunnel(query.funnel) : undefined;
  const firstName = query.first_name?.trim().slice(0, 60);
  return (
    <GravitasApp
      experience="jump-in"
      funnel={funnel}
      firstName={firstName}
      requireAuthBeforeAnalysis
      handoffToken={query.handoff?.trim().slice(0, 180)}
    />
  );
}
