# Gravitas Signals Core v1

## Activation

1. Apply `supabase/migrations/202608060001_gravitas_signals.sql` to the connected Supabase project.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Browser roles have no table access.
3. Set `FOUNDER_EMAILS` to a comma-separated allowlist, or set a founder user's Supabase `app_metadata.role` to `founder`.
4. Optionally set `GRAVITAS_SIGNALS_TEST_MODE=true` in demo environments. Stripe test-mode events and localhost events are tagged automatically.
5. Set `SIGNALS_RATE_LIMIT_SECRET` to at least 32 random characters. The ingestion route HMACs the request address with a rotating daily bucket and never persists the raw address. The Supabase rate-limit function permits 120 signals per minute per bucket and discards expired buckets opportunistically.

The dashboard is available at `/founder`. Production reporting excludes test/demo signals unless explicitly included in the dashboard.

“Today” begins at midnight in `Australia/Melbourne`. Seven- and thirty-day views are exact rolling windows ending at request time. Dashboard rows and anonymous timelines are fetched in stable 1,000-row pages without a total-row ceiling.

## Privacy contract

Signals may contain stable anonymous UUIDs, coarse source mode, Graviton, cadence, evidence number, workflow action, campaign identifiers and payment outcome metadata. They must never contain submitted text, image data, email addresses, names, full landing URLs, or report output.

Public properties are declared per event in the signal registry. Undeclared properties are discarded. Landing attribution accepts only a relative pathname without query or fragment, referrers are reduced to validated hostnames, and campaign values use a bounded identifier-safe alphabet.

## Reliability contract

Client events are fire-and-forget. Public ingestion accepts only client-enabled names from the versioned registry. Server writers catch and report storage failures without propagating them into Gravitas, analysis responses, checkout creation, or Stripe fulfillment. Verified outcomes can only be written by server routes using the service role.

If rate limiting is unavailable or misconfigured, analytics ingestion fails closed with an empty `202` response so Gravitas remains unaffected. Exceeded buckets receive `429`; the browser emitter ignores analytics responses.

## Checkout attribution

Authenticated subscription checkout carries visitor, session, surface, first-touch and last-touch identifiers into Stripe metadata. Verified webhooks copy only this bounded attribution into purchase signals. No submitted content or customer details are placed in Stripe metadata.

The Jump-In Day Pass currently leaves Gravitas through `https://multirrupt.com/day-pass/`. Journey linkage cannot be guaranteed unless that external page forwards a supported Stripe `client_reference_id` or creates Checkout Sessions through this application. Do not append arbitrary attribution to the external payment link until that forwarding behaviour is controlled and verified.

## Retention and owner maintenance

The initial policy is to retain raw signal rows for 13 months, then delete or anonymise them through an owner-controlled maintenance operation. Automatic retention is deliberately deferred until production volume and reporting needs are understood. Aggregated, non-identifying business metrics may be retained longer.

Application and service roles cannot mutate signals. A database owner can perform an approved deletion or anonymisation inside one transaction:

```sql
begin;
alter table public.gravitas_signals disable trigger gravitas_signals_no_update;
alter table public.gravitas_signals disable trigger gravitas_signals_no_delete;
alter table public.gravitas_signals disable trigger gravitas_signals_no_truncate;

-- Execute the approved, narrowly scoped DELETE or anonymising UPDATE here.

alter table public.gravitas_signals enable trigger gravitas_signals_no_update;
alter table public.gravitas_signals enable trigger gravitas_signals_no_delete;
alter table public.gravitas_signals enable trigger gravitas_signals_no_truncate;
commit;
```

Export or back up affected rows first. Never grant trigger-management privileges to application roles.
