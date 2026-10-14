# Cadence and guidance release — 2026-10-14

Adds Dynamic Preserve and Sustained Preserve alongside the existing Cadences. Preserve limits edits to the top 2–3 critical reader-side problems while protecting voice, rhythm, humour and useful anecdotes. All 30 current Gravitons have contextual help and recommendations where applicable.

Analysis and rewrite headers use saved settings and generation times; Earlier Work retains those markers. Rewrite timestamps survive workspace restoration. Uploaded documents retain their source filenames. Changing Cadence allows another analysis of the same source and lens.

Integrates with staging baseline 71cfec5, retaining document uploads, Reader Hold, and existing release features. The original checkout's unrelated sign-in/API edits are excluded. Also fixes the existing Signals exclusion effect error with a subscribed external store, and declares the existing CommonJS test convention in the handoff test.

No database migrations or new environment variables. Existing records remain compatible; missing historical timestamps are displayed as not recorded. Rollback: revert the release commit and redeploy through the normal process. Older builds cannot restore newly saved Preserve-mode workspaces, so retain this compatibility consideration when rolling back.

Local validation: TypeScript passes; lint has no errors and five existing warnings. Full tests and production build are run before staging deployment. Authenticated analysis, paid access and checkout still need live acceptance checks.
