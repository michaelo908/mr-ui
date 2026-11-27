import { auditHtml, auditMarkdown } from "@/lib/audit/export";
import { ownedAudit, requireAuditEnvironment } from "@/lib/audit/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireAuditEnvironment();
    const job = await ownedAudit((await params).id);
    if (job.status !== "completed" || !job.result)
      throw new Error("Report is not ready.");
    const format = new URL(req.url).searchParams.get("format");
    if (format === "html")
      return new Response(auditHtml(job), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    return new Response(auditMarkdown(job), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="multirrupt-reader-side-audit-${job.id}.md"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Saved report unavailable.", { status: 404 });
  }
}
