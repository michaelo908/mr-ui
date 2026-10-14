# Cadence and guidance release — 2026-10-15

Adds Dynamic Preserve and Sustained Preserve alongside the existing Cadences. Preserve limits edits to the top 2–3 critical reader-side problems while protecting voice, rhythm, humour and useful anecdotes. All 30 current Gravitons have contextual help and recommendations where applicable.

Analysis and rewrite headers use saved settings and generation times; Earlier Work retains those markers. Rewrite timestamps survive workspace restoration. Uploaded documents retain their source filenames. Changing Cadence allows another analysis of the same source and lens.

Reconciles the exact live production source from deployment dpl_EZX8RMG8QK3Zo5Cm7A7NxhhQ8T46: branch commit b2c83f8 plus its deployed working changes. All 170 deployed source files were verified against the production inventory. Retains the green/yellow Reader Hold bar, short-form editorial policy, preview-first Jump In, samples, and acquisition/Signals improvements. The original checkout's unrelated sign-in/API edits are excluded. Also fixes the existing Signals exclusion effect error with a subscribed external store, and declares the existing CommonJS test convention in the handoff test.

No database migrations or new environment variables. Existing records remain compatible; missing historical timestamps are displayed as not recorded. Rollback: restore the preceding production deployment through Vercel; do not redeploy the older main baseline. Older builds cannot restore newly saved Preserve-mode workspaces, so retain this compatibility consideration when rolling back.

Local validation: all 275 tests pass; TypeScript and production build pass; lint has no errors and seven existing warnings from the live baseline. Signed-in staging analysis, Preserve rewrite and persistence were verified before reconciliation; the corrected green/yellow interface is being rechecked on staging. Paid checkout has not been retested.
