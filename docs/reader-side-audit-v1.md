# Reader Side Audit V1.0 — staging implementation

## Scope and deployment boundary

Approved scope: a free homepage mini; US$59 for up to five explicitly selected URLs including the user-identified homepage; optional US$29 AI Answer Readiness on those same captured pages. No discovery crawl. Existing US$19 48-hour Day Pass or US$97 subscription enables remediation. One comprehensive audit per paid subscription billing period, no rollover, failures do not consume the allowance.

Frontend implementation starts at staging f32fee4867edcecbec987939b0107cc80786925e. Backend starts at 759dde1724b824957c3d7b3801b3eebe1ee15181. Existing unrelated working copies are untouched. All new audit paths are disabled unless explicitly enabled for the dedicated staging frontend, staging API, staging Supabase project and Stripe test key. Production promotion is not authorised.

## Methodology

Reader Response dimensions: Orientation, Authority, Continuity, Dissonance, Resonance, Resolution, Load. Levels: Exceptional, Effective, Compromised, Deficient, Counterproductive, Insufficient Evidence. No averaged score. Protect justified complexity and effective choices. Assess gratuitous persuasion qualitatively. Prioritise interventions by consequences, dependencies, reach and evidence, not a fixed severity ladder.

Each finding contains evidence, consequences, a remedy and a rationale for its priority. Text evidence must be an exact substring of the supplied source; visual evidence must reference an existing captured viewport. Profile dimensions and levels are validated. A mini has exactly three distinct findings and a tailored Beyond the Homepage rationale. Limitations survive generation and synthesis. Retrieved pages are untrusted data, never system instructions.

AI Answer Readiness uses Accessibility, Semantic Clarity, Answer Sufficiency, Contextual Independence, Evidential Authority and Semantic Consistency. Existing fetched HTML contributes limited technical observations without another request. This is not a WCAG audit or proof of access by a particular crawler. No ranking or AI inclusion guarantees.

## Architecture and persistence

- New `/audit` workspace and account-owned saved reports. Anonymous access uses a 256-bit HttpOnly capability cookie; sign-in can claim those reports. Browser roles cannot read the underlying audit tables or private source bucket directly.
- Capture each explicit URL once; preserve text, four ordered desktop viewports, technical observations, timestamp and coverage limits in private Supabase Storage. Capture limits are visible to readers. The maximum stored object size is 8 MB.
- Run one page stage per URL, followed by one cross-page synthesis using the individual reports and their cited evidence. AI readiness reuses the original source objects. Completed reports do not trigger model calls when reopened.
- Jobs, stage leases and usage reservations are persisted in PostgreSQL. A worker thread in the existing staging Railway service polls the existing staging frontend once per minute when idle, or two seconds after completing a stage. No additional queue service or hosting project is introduced. Jobs continue after browser closure and recover after expired leases. Failed stages require a deliberate retry; there are at most two attempts per stage.
- Jobs use a database lease plus expected step to prevent duplicate or stale work. Unknown provider outcomes retain their full reserved cost. Saved captures are reused on retry.
- Entitlement reservation, completion and release are transactional. Subscription keys include subscription ID and actual billing-period start/end, and require paid-through coverage. Add-on purchases are tied to their original completed audit. Unused purchases are recoverable in the audit workspace.
- Remediation opens the existing paid editor with an explicit load action, saved source and audit guidance. The action clearly explains that loading the source replaces the active editor workspace. Saved reports remain intact.
- Shared editor/URL handlers were moved from route exports to `lib/mr-request.ts` and `lib/url-source-request.ts` to satisfy Next.js route type constraints. Their existing behaviour is unchanged.

## Processing bounds and costs

| Product | Total input allowance | Total output allowance | Reserved job ceiling, USD |
|---|---:|---:|---:|
| Mini | 12,000 | 2,500 | 0.55 |
| Comprehensive | 80,000 | 18,000 | 4.00 |
| AI readiness | 45,000 | 8,000 | 2.00 |

Count the actual multimodal input before generation. No SDK retries. The output allowance includes reasoning. The model stays `gpt-6-astra`, with low reasoning effort. The existing editor governor/rewrite path is not used for audit analysis.

Cost accounting uses US$10/million input and US$50/million output without cache discounts. Captures reserve US$0.018 per capture stage for the existing two-attempt ScreenshotOne wrapper; reused captures add no capture allowance. This is a conservative exposure ledger, not a provider invoice. Unknown model outcomes retain the entire stage reservation. Hosting, storage, payment fees and taxes are additional.

`AUDIT_DAILY_USD` defaults to 25, maximum 100. Both new job reservations and execution-day stage reservations enforce that ceiling, so previous-day backlog cannot bypass the execution limit. A default three-new-jobs-per-day limit applies to both a pseudonymous address bucket and owner bucket. The table ledger is authoritative; Signals reports linked conversion and processing exposure, including failed and uncertain attempts.

The free tier's normal cost should be measured during calibration; its budget is not a claim about observed average cost. Review the allowance against evidence quality before increasing volume. Stored anonymous source retention and paid-source lifecycle should be reviewed before a public launch; this staging version does not run a destructive retention sweep.

## Staging activation sequence

1. Confirm current frontend deployment revision, staging backend service/environment, staging Supabase project `gglalhqmdnbdygcxasyd`, and Stripe test mode. Do not export all environment secrets.
2. Run `npm test`, `npm run test:audit-db`, TypeScript, lint and the Next build. Run backend tests with the pinned supported SDK. Database tests use an isolated PostgreSQL engine, not production or staging data.
3. Apply `202611280001_reader_side_audit.sql` to staging only. It adds private audit tables, transactional functions, a private source bucket and the audit Signals category.
4. Deploy the frontend and backend candidates to the existing staging projects with audit flags initially off. Frontend: `AUDIT_ENABLED=true`, `NEXT_PUBLIC_AUDIT_ENABLED=true`, `AUDIT_DAILY_USD=25`. Backend: `AUDIT_ENABLED=true`, `AUDIT_ENVIRONMENT=staging`. Verify staging `MR_API_KEY` matches across the existing services. The frontend rejects other service hostnames, databases or a live Stripe key.
5. Exercise a free mini, a five-page comprehensive audit, subscription allowance, test checkout, optional readiness, saved-source inspection, account claim and paid remediation. Close the browser during a job and verify background completion. Reopen without new analysis. Verify cancellation/renewal, duplicate checkout webhook, simultaneous run, failure/retry and permission boundaries.
6. Calibrate methodology on contrasting actual sites and controlled source pairs. Do not activate a public production product before this gate is passed and production approval is obtained.

## Calibration acceptance criteria

Use a clear service homepage, a dense technical offering, a visually persuasive page with weak evidence, and a sparse/partially inaccessible page. Include a coherent multi-page set and a controlled contradiction pair. Each set stays within five URLs; no crawling.

Record source snapshots, prompt/model version, raw results, input/output tokens, duration, attempts and exposure. Inspect every citation. Check that density is not automatically penalised; effective choices are preserved; missing evidence becomes Insufficient Evidence; persuasion is not counted mechanically; priorities have causal justification; and cross-page findings use both pages rather than inventing a journey. Readiness must distinguish technical uncertainty from poor writing. Repeat at least two contrasting cases to assess stability without selecting only favourable outputs. Include a prompt-injection source fixture.

Current status (28 November 2026): local implementation, regression checks and the Next.js webpack build pass. The audit schema was applied successfully through the SQL editor in Gravitas Staging (`gglalhqmdnbdygcxasyd`); Supabase reported “Success. No rows returned.” Frontend/backend deployment, live payment checks and methodology calibration remain outstanding. Railway deployment access is awaiting renewed sign-in. No production changes have been made. The local webpack build is used because Turbopack rejects the shared node_modules symlink outside the worktree root.
