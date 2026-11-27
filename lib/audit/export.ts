import type { AuditJob, AuditReport } from "./contracts";

function title(job: AuditJob) {
  return job.kind === "mini"
    ? "Homepage mini audit"
    : job.kind === "readiness"
      ? "AI Answer Readiness"
      : "Comprehensive audit";
}
function reportMarkdown(report: AuditReport, heading: string) {
  return [
    `## ${heading}`,
    "",
    report.summary,
    "",
    "### Reader profile",
    "",
    ...report.profile.flatMap((item) => [
      `- **${item.dimension} — ${item.level}:** ${item.rationale}`,
    ]),
    "",
    "### Findings and remedies",
    "",
    ...report.findings.flatMap((finding, index) => [
      `#### ${index + 1}. ${finding.title}`,
      "",
      `**Consequence:** ${finding.consequence}`,
      "",
      `**Remedy:** ${finding.remedy}`,
      "",
      `**Why this priority:** ${finding.priority}`,
      "",
      ...finding.evidence.flatMap((evidence) =>
        evidence.quote
          ? [`> ${evidence.quote}`, "", `Page ${evidence.page}${evidence.viewport ? ` · viewport ${evidence.viewport}` : ""}`, ""]
          : [`Page ${evidence.page}${evidence.viewport ? ` · viewport ${evidence.viewport}` : ""}`, ""],
      ),
    ]),
    ...(report.beyond_homepage
      ? ["### Beyond the Homepage", "", report.beyond_homepage, ""]
      : []),
    "### Evidence and coverage limits",
    "",
    ...report.limitations.map((limit) => `- ${limit}`),
  ].join("\n");
}
export function auditMarkdown(job: AuditJob) {
  const sections = [
    "# Multirrupt Reader Side Audit",
    "",
    `**Assessment:** ${title(job)}`,
    `**Saved:** ${new Date(job.created_at).toISOString()}`,
    "",
    "## Selected pages",
    "",
    ...job.urls.map((url, index) => `${index + 1}. ${url}`),
    "",
  ];
  if (job.result) sections.push(reportMarkdown(job.result, "Assessment report"));
  job.reports.forEach((report, index) =>
    sections.push("", reportMarkdown(report, `Page ${index + 1} assessment`)),
  );
  return `${sections.join("\n").trim()}\n`;
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}
export function auditHtml(job: AuditJob) {
  const markdown = auditMarkdown(job);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title(job))} · Multirrupt</title><style>body{font:16px/1.55 ui-sans-serif,system-ui,sans-serif;color:#172033;max-width:900px;margin:0 auto;padding:48px 28px}pre{white-space:pre-wrap;font:inherit}button{position:fixed;right:24px;top:20px;border:0;border-radius:8px;padding:10px 14px;background:#172033;color:white;font-weight:600;cursor:pointer}@media print{body{padding:0;max-width:none}button{display:none}}</style></head><body><button onclick="window.print()">Print / Save PDF</button><pre>${escapeHtml(markdown)}</pre></body></html>`;
}
