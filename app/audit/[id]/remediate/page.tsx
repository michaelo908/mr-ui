import { notFound, redirect } from "next/navigation";
import GravitasApp from "@/components/GravitasApp";
import { authenticatedLifecycle } from "@/lib/lifecycle-server";
import {
  auditSignal,
  getSource,
  ownedAudit,
  requireAuditEnvironment,
} from "@/lib/audit/server";
import { JUMP_IN_DAY_PASS_URL } from "@/lib/jump-in";
export const dynamic = "force-dynamic";
export default async function Remediate({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  try {
    requireAuditEnvironment();
  } catch {
    notFound();
  }
  const { id } = await params;
  const index = Number((await searchParams).page || 0);
  const access = await authenticatedLifecycle();
  if (!access)
    redirect(
      `/login?next=${encodeURIComponent(`/audit/${id}/remediate?page=${index}`)}`,
    );
  const job = await ownedAudit(id);
  if (
    job.status !== "completed" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= job.urls.length
  )
    notFound();
  if (access.lifecycle.state === "jump_in")
    return (
      <main className="mx-auto max-w-2xl space-y-6 p-10 text-neutral-100">
        <h1 className="text-3xl font-semibold">Put your audit into practice</h1>
        <p>
          Your saved audit and source context are ready. Remediation uses active
          Multirrupt access.
        </p>
        <a className="block text-sky-300 underline" href={JUMP_IN_DAY_PASS_URL}>
          Get the US$19 48-hour Day Pass
        </a>
        <a className="block text-sky-300 underline" href="/workbench">
          Subscribe for US$97
        </a>
        <p>After purchase, return to this saved audit to continue.</p>
        <a href="/audit" className="text-sky-300 underline">
          Return to Audit
        </a>
      </main>
    );
  const source = await getSource(job, index);
  const context = JSON.stringify({
    methodology: "Reader Side Audit V1.0",
    page: index + 1,
    source_url: source.finalUrl,
    captured_at: source.capturedAt,
    individual: job.reports[index] || null,
    synthesis: job.result,
  });
  await auditSignal("audit.remediation_opened", job, { page: index + 1 });
  return <GravitasApp auditHandoff={{ id: job.id, source, context }} />;
}
