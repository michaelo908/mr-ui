"use client";
import { useEffect, useRef, useState } from "react";
import type {
  AuditJob,
  AuditKind,
  AuditReport,
  AuditSource,
} from "@/lib/audit/contracts";
const button =
  "rounded-lg bg-sky-300 px-4 py-2 font-semibold text-neutral-950 disabled:opacity-40";
async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function Report({
  report,
  job,
  onSource,
}: {
  report: AuditReport;
  job: AuditJob;
  onSource: (index: number) => void;
}) {
  return (
    <section className="space-y-6">
      <p className="text-lg leading-relaxed">{report.summary}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {report.profile.map((p) => (
          <div
            key={p.dimension}
            className="rounded-xl border border-neutral-700 p-4"
          >
            <dt className="font-semibold">
              {p.dimension}{" "}
              <span className="block text-sm text-sky-300">{p.level}</span>
            </dt>
            <dd className="mt-2 text-sm text-neutral-300">{p.rationale}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-4">
        {report.findings.map((f, i) => (
          <article key={i} className="rounded-xl bg-neutral-900 p-5">
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-neutral-300">{f.consequence}</p>
            <p className="mt-3">
              <strong>Remedy: </strong>
              {f.remedy}
            </p>
            <p className="mt-2 text-sm text-sky-200">
              <strong>Why this priority: </strong>
              {f.priority}
            </p>
            <div className="mt-3 space-y-2">
              {f.evidence.map((e, j) => (
                <blockquote
                  key={j}
                  className="border-l-2 border-neutral-600 pl-3 text-sm text-neutral-400"
                >
                  {e.quote && <p>“{e.quote}”</p>}
                  <button
                    className="text-sky-300 underline"
                    onClick={() => onSource(e.page - 1)}
                  >
                    Page {e.page}
                    {e.viewport ? ` · viewport ${e.viewport}` : ""} · inspect
                    saved evidence
                  </button>
                </blockquote>
              ))}
            </div>
            <a
              className="mt-4 inline-block text-sky-300 underline"
              href={`/audit/${job.id}/remediate?page=${f.evidence[0].page - 1}`}
            >
              Work on this page
            </a>
          </article>
        ))}
      </div>
      {report.beyond_homepage && (
        <aside className="rounded-xl border border-sky-700 p-5">
          <h3 className="font-semibold">Beyond the Homepage</h3>
          <p className="mt-2">{report.beyond_homepage}</p>
        </aside>
      )}
      <details>
        <summary className="cursor-pointer text-neutral-400">
          Evidence and coverage limits
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-400">
          {report.limitations.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
export default function AuditWorkspace() {
  const [purchases, setPurchases] = useState<
    { entitlement_key: string; kind: AuditKind; parent_id: string | null }[]
  >([]);
  const [urls, setUrls] = useState([""]);
  const [audits, setAudits] = useState<AuditJob[]>([]);
  const [job, setJob] = useState<AuditJob | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<AuditSource | null>(null);
  const [checkout, setCheckout] = useState<string | null>(null);
  const [paidKind, setPaidKind] = useState<AuditKind>("comprehensive");
  const [parentId, setParentId] = useState<string | null>(null);
  const running = useRef(false);
  const starting = useRef(false);
  async function refresh() {
    const data = await api("/api/audit");
    setAudits(data.audits);
    setSignedIn(data.signedIn);
    setPurchases(data.purchases || []);
  }
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setCheckout(q.get("checkout"));
    setPaidKind(q.get("kind") === "readiness" ? "readiness" : "comprehensive");
    setParentId(q.get("parent"));
    try {
      const saved = sessionStorage.getItem("mr-audit-urls");
      if (saved) setUrls(JSON.parse(saved));
    } catch {}
    void api("/api/audit/claim", {})
      .catch(() => {})
      .then(refresh)
      .catch((e) => setError(e.message));
  }, []);
  async function run(initial: AuditJob) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    let current = initial;
    try {
      while (current.status !== "completed") {
        const next = await api(`/api/audit/${current.id}/advance`, {});
        current = next.audit;
        setJob(current);
        if (current.status === "failed") break;
        if (current.status === "running")
          await new Promise((r) => setTimeout(r, 2500));
      }
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Processing interrupted. Your progress is saved.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function start(kind: AuditKind) {
    if (starting.current || running.current) return;
    starting.current = true;
    setError("");
    setBusy(true);
    try {
      const data = await api("/api/audit", {
        id: crypto.randomUUID(),
        kind,
        urls: kind === "mini" ? [urls[0]] : urls,
        checkout: kind === paidKind ? checkout : null,
        parentId,
      });
      setJob(data.audit);
      await run(data.audit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start audit.");
    } finally {
      starting.current = false;
      setBusy(false);
    }
  }
  async function purchase(kind: AuditKind, parent?: string) {
    setError("");
    setBusy(true);
    try {
      sessionStorage.setItem("mr-audit-urls", JSON.stringify(urls));
      const data = await api("/api/audit/checkout", {
        kind,
        parentId: parent,
        requestId: crypto.randomUUID(),
      });
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout unavailable.");
      setBusy(false);
    }
  }
  async function inspect(index: number) {
    try {
      const data = await api(`/api/audit/${job!.id}/source?page=${index}`);
      setSource(data.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Source unavailable.");
    }
  }
  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-10 text-neutral-100">
      <div className="mx-auto max-w-5xl space-y-10">
        <header>
          <a href="/workbench" className="text-sm text-neutral-400 underline">
            ← Multirrupt editor
          </a>
          <p className="mt-8 text-xs uppercase tracking-widest text-sky-300">
            Multirrupt · Reader Side Audit V1.0 · Staging
          </p>
          <h1 className="mt-3 text-4xl font-semibold">
            How does your website read?
          </h1>
          <p className="mt-4 max-w-2xl text-neutral-300">
            Examine how your pages build understanding, trust and a clear way
            forward. Start with a free homepage audit, or select up to five
            pages for a comprehensive assessment.
          </p>
        </header>
        <section className="rounded-2xl border border-neutral-800 p-6">
          <h2 className="text-xl font-semibold">Your selected pages</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Homepage first. We examine only these URLs; we do not crawl your
            site. Capture and evidence limits are shown in your report.
          </p>
          <div className="my-5 space-y-3">
            {urls.map((u, i) => (
              <label key={i} className="block text-sm">
                {i === 0 ? "Homepage" : `Page ${i + 1}`}
                <input
                  value={u}
                  onChange={(e) =>
                    setUrls((v) =>
                      v.map((x, n) => (n === i ? e.target.value : x)),
                    )
                  }
                  type="url"
                  placeholder="https://example.com"
                  disabled={busy}
                  className="mt-1 block w-full rounded-lg border border-neutral-600 bg-neutral-900 p-3"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {urls.length < 5 && (
              <button
                disabled={busy}
                onClick={() => setUrls((v) => [...v, ""])}
                className="rounded-lg border border-neutral-600 px-4 py-2"
              >
                Add a page
              </button>
            )}
            {urls.length > 1 && (
              <button
                disabled={busy}
                onClick={() => setUrls((v) => v.slice(0, -1))}
                className="px-4 py-2 text-neutral-400"
              >
                Remove last page
              </button>
            )}
            <button
              className={button}
              disabled={busy || !urls[0]}
              onClick={() => void start("mini")}
            >
              Free homepage mini audit
            </button>
          </div>
          <div className="mt-6 border-t border-neutral-800 pt-5">
            <p className="text-sm text-neutral-300">
              Comprehensive audit · US$59 · up to five URLs · individual
              assessments, cross-page synthesis and prioritised remedies.
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              Subscribers receive one comprehensive audit per billing period. No
              rollover. Failed runs do not consume the allowance.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {signedIn ? (
                <>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => void purchase("comprehensive")}
                  >
                    Buy comprehensive audit · US$59
                  </button>
                  <button
                    className="rounded-lg border border-neutral-600 px-4 py-2"
                    disabled={busy}
                    onClick={() => void start("comprehensive")}
                  >
                    Use subscription allowance
                  </button>
                </>
              ) : (
                <a className={button} href="/login?next=%2Faudit">
                  Sign in to purchase or save audits
                </a>
              )}
              {checkout && (
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => void start(paidKind)}
                >
                  Start purchased{" "}
                  {paidKind === "readiness"
                    ? "AI readiness assessment"
                    : "audit"}
                </button>
              )}
            </div>
          </div>
        </section>
        {purchases.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">
              Purchased assessments ready to use
            </h2>
            {purchases.map((p) => (
              <button
                key={p.entitlement_key}
                className="mr-3 rounded-lg border border-sky-700 px-4 py-2"
                disabled={busy}
                onClick={() => {
                  setCheckout(p.entitlement_key.slice(9));
                  setPaidKind(p.kind);
                  setParentId(p.parent_id);
                  setError(
                    "Purchase selected. Check your URLs, then select Start purchased audit above.",
                  );
                }}
              >
                Select purchased {p.kind}
              </button>
            ))}
          </section>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-amber-700 p-4 text-amber-200"
          >
            {error}
          </p>
        )}
        {job && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold">
                {job.kind === "mini"
                  ? "Homepage mini audit"
                  : job.kind === "readiness"
                    ? "AI Answer Readiness"
                    : "Comprehensive audit"}
              </h2>
              <span role="status" className="text-sm text-neutral-400">
                {busy ? `Processing · ${job.step} steps saved` : job.status}
              </span>
            </div>
            {job.failure && (
              <p className="text-amber-200">
                {job.failure} Your entitlement has not been consumed.
              </p>
            )}
            {job.status !== "completed" && !busy && job.attempts < 2 && (
              <button className={button} onClick={() => void run(job)}>
                Resume from saved progress
              </button>
            )}
            {job.result && (
              <Report
                report={job.result}
                job={job}
                onSource={(i) => void inspect(i)}
              />
            )}{" "}
            {job.reports.map((r, i) => (
              <details
                key={i}
                className="rounded-xl border border-neutral-800 p-5"
              >
                <summary className="cursor-pointer font-semibold">
                  Page {i + 1} · {job.urls[i]}
                </summary>
                <div className="mt-5">
                  <Report
                    report={r}
                    job={job}
                    onSource={(n) => void inspect(n)}
                  />
                </div>
              </details>
            ))}
            {job.status === "completed" && job.kind === "comprehensive" && (
              <aside className="rounded-xl border border-neutral-700 p-5">
                <h3 className="font-semibold">AI Answer Readiness · US$29</h3>
                <p className="my-3 text-sm text-neutral-300">
                  Assess accessibility, semantic clarity, answer sufficiency,
                  contextual independence, evidential authority and semantic
                  consistency using these saved pages. No ranking or inclusion
                  guarantees.
                </p>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => void purchase("readiness", job.id)}
                >
                  Add AI Answer Readiness
                </button>
              </aside>
            )}
          </section>
        )}
        {source && (
          <section className="rounded-xl border border-sky-800 p-5">
            <div className="flex justify-between gap-3">
              <h2 className="font-semibold">Saved source · {source.title}</h2>
              <button onClick={() => setSource(null)}>Close</button>
            </div>
            <p className="my-2 break-all text-sm text-neutral-400">
              {source.finalUrl} · captured{" "}
              {new Date(source.capturedAt).toLocaleString()}
            </p>
            <details>
              <summary className="cursor-pointer">Supporting text</summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm">
                {source.text}
                {source.technicalEvidence ? `\n\n${source.technicalEvidence}` : ""}
              </pre>
            </details>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {source.images.map((url, i) => (
                <figure key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Saved viewport ${i + 1}`}
                    className="w-full rounded"
                  />
                  <figcaption className="text-sm text-neutral-400">
                    Viewport {i + 1}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
        <section>
          <h2 className="text-xl font-semibold">Saved audits</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Reopening a completed report does not run another analysis.
            {!signedIn &&
              " Sign in to retain audits in your account; anonymous access depends on this browser's cookie."}
          </p>
          <ul className="mt-4 space-y-2">
            {audits.map((a) => (
              <li key={a.id}>
                <button
                  disabled={busy}
                  onClick={() => {
                    setJob(a);
                    setSource(null);
                    setError("");
                  }}
                  className="w-full rounded-lg border border-neutral-800 p-4 text-left"
                >
                  <span className="break-all">{a.urls[0]}</span>
                  <span className="mt-1 block text-sm text-neutral-400">
                    {a.kind} · {a.status} ·{" "}
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
