# Gravitas release checklist

Use this path for every Gravitas release: local → staging → review → production.

## 1. Local validation

- Work on `staging` or a short-lived branch based on `staging`; never develop directly on `main`.
- Confirm `git status` contains only intended files and no credentials or generated artifacts.
- During a Jump In signing-key rotation, configure the old signing value only as
  `JUMP_IN_PREVIOUS_SESSION_SECRET` for the bounded seven-day transition window,
  then remove it after all previously issued cookies have expired.
- Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- Review migrations, environment requirements, privacy boundaries, and rollback notes.

## 2. Staging deployment

- Commit the reviewed change and push it to `origin/staging`.
- Confirm `mr-ui-staging` deploys that exact commit as its Production deployment.
- Confirm `gravitas-staging.multirrupt.ai` resolves to `mr-ui-staging`, not `mr-ui`.
- Confirm staging uses only staging Supabase, Stripe test mode, and staging-scoped configuration.
- Apply database migrations to staging only before exercising dependent application paths.

## 3. Review and acceptance

- Smoke-test login, paid Gravitas, Jump-In, text, URL, images, Gravitons, evidence navigation, rewrites, and responsive layouts.
- Verify Founder Dashboard access, attribution, test-data exclusion, rate limiting, privacy-safe timelines, and verified server events.
- Complete a Stripe test checkout and confirm automatic signed webhook delivery.
- Record the staging deployment ID, commit SHA, test results, known warnings, and reviewer approval.

## 4. Production promotion

- Open a reviewed pull request from `staging` to `main`; do not force-push or bypass review.
- Re-run required checks against the exact promotion commit.
- Apply approved production migrations immediately before or with the compatible application release.
- Merge to `main` only after explicit production approval; the `mr-ui` project deploys from `main`.
- Verify production domains, authentication, analysis, checkout, webhook health, and error monitoring.
- If rollback is required, revert the production commit and redeploy; never rewrite shared branch history.

## Isolation rule

`mr-ui-staging` owns `gravitas-staging.multirrupt.ai` and staging/test resources. `mr-ui` owns `multirrupt.ai` and `www.multirrupt.ai` and remains production-only. Never copy production Supabase or live Stripe secrets into staging.
