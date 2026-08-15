# Gravitas acquisition system — foundation release

## Routes

- `/check/email`
- `/check/proposal`
- `/check/landing-page`
- `/jump-in?funnel=email&first_name=Michael`

All three acquisition pages render from `lib/acquisition-funnels.ts`. Adding a later use case should require one reviewed config entry, not a copied page.

## Verified baseline before this release

- The public app route rendered the authenticated `GravitasApp`; the free product experience existed at `/jump-in`.
- Jump-In grants 20 minutes from the first analysis, resets after seven days, accepts pasted text up to 800 words, and captures up to 10 webpage viewports.
- Existing signals covered session start/expiry, source selection, analysis start/completion/failure, report depth and evidence use, rewrites, checkout, Day Pass and subscription lifecycle.
- First/last-touch attribution already captured UTM values, Meta campaign/ad-set/ad IDs, referrer host and landing path without storing submitted source content.
- Stripe purchase events and Supabase profile/subscription state are authoritative; Mailchimp is a communication layer only.
- No Mailchimp code, acquisition signup endpoint, funnel config, or funnel-specific landing routes existed.
- Available in-repository brand assets: `public/MR_Logo1.png` plus framework placeholder icons. The landing foundation uses only the Gravitas logo and CSS.

## Mailchimp setup (inactive by default)

Required server-only environment variables:

```text
MAILCHIMP_API_KEY=
MAILCHIMP_AUDIENCE_ID=
MAILCHIMP_SERVER_PREFIX=
MAILCHIMP_SIGNUP_MODE=draft
```

`MAILCHIMP_SIGNUP_MODE` must remain `draft` during local and staging review. After Michael approves the audience, tags, consent language and journeys, create these audience tags and set the production value to `live`:

- `gravitas_email_check_lead`
- `gravitas_proposal_check_lead`
- `gravitas_landing_page_check_lead`

The endpoint upserts the contact, sets `FNAME`, then applies exactly one acquisition tag. It never sends email or activates a journey. Email addresses and names are sent only to Mailchimp in live mode and are never written to Gravitas Signals.

## Lifecycle automation drafts

Build three separate Mailchimp Customer Journeys, each starting when its matching tag is added. Keep all journeys paused until approved. Add an exit/routing rule before every educational or sales message:

1. If `subscription_customer` or `pro_customer` is present, exit to subscriber onboarding.
2. Else if `day_pass_customer` is present, exit to Day Pass onboarding.
3. Otherwise continue the use-case journey.

The customer tags above should be applied from verified Stripe/Supabase lifecycle events in a later approved release; they must not be inferred from Mailchimp clicks.

### Email Check journey

| Timing | Subject | Purpose / CTA |
| --- | --- | --- |
| Immediate | `*|FNAME|*, your free email check is ready` | Return to the framed Email Check; remind them the timer starts with analysis. |
| Day 1 | `The sentence you wrote is not the message they receive` | Explain intention versus reception; CTA to check one important email. |
| Day 3 | `Why a clear email can still create resistance` | Teach tone, pressure and trust signals; CTA to view reader-side analysis. |
| Day 5 | `The final question before you press Send` | Provide a short pre-send habit; CTA to use Gravitas on the next consequential email. |
| Day 7 | `More important messages to check?` | Introduce the US$19 48-hour Day Pass and subscription without urgency theatre. |

### Proposal Check journey

| Timing | Subject | Purpose / CTA |
| --- | --- | --- |
| Immediate | `*|FNAME|*, your free proposal check is ready` | Return to the framed Proposal Check. |
| Day 1 | `A proposal can be understood and still not move` | Explain comprehension versus decision momentum. |
| Day 3 | `Where buyer hesitation hides` | Teach perceived risk, proof and differentiation. |
| Day 5 | `What the recipient needs to believe next` | Teach sequencing and confidence; CTA to analyse a critical section. |
| Day 7 | `Before the next proposal leaves your hands` | Offer Day Pass/subscription for complete or repeated proposal work. |

### Landing Page Check journey

| Timing | Subject | Purpose / CTA |
| --- | --- | --- |
| Immediate | `*|FNAME|*, your free landing page check is ready` | Return to URL-mode Jump-In. |
| Day 1 | `Your visitor does not experience copy in a document` | Explain natural-environment and viewport analysis. |
| Day 3 | `Where attention changes as the page moves` | Teach hierarchy, transitions and cognitive load. |
| Day 5 | `Traffic cannot repair a loss of belief` | Teach trust and conversion friction; CTA to analyse the live page. |
| Day 7 | `Check the page before buying more traffic` | Offer Day Pass/subscription for iteration and full-page work. |

## Tracking contract

The acquisition funnel is now measurable as:

`acquisition.funnel_viewed` → `acquisition.signup_completed` → `discovery.session_started` → `analysis.started` → verified `analysis.completed` → verified purchase events.

`funnel` is stored only as one of `email`, `proposal`, or `landing-page`. First/last-touch campaign attribution follows the existing privacy-safe contract. No message, page copy, URL, name or email is written into Signals.

## Approval gates

Before production activation:

- Review final copy and consent language.
- Confirm Mailchimp audience ID and exact tag names.
- Build journeys from these drafts and keep them paused for content review.
- Add verified Day Pass/subscriber Mailchimp lifecycle sync and test journey exits.
- Verify staging with designated test contacts, then obtain Michael's approval to set `MAILCHIMP_SIGNUP_MODE=live`.
- Do not publish ads or activate journeys as part of this foundation release.
