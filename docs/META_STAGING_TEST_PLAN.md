# Meta COD tracking: isolated staging acceptance plan

Status: **prepared, not deployed**. This checklist is for validating the Draft PR
before any production rollout. Do not use the existing `shopify.app.toml` to
start staging: it identifies the production Shopify app and the live
`https://cod.al-fajr.ma` backend.

## Environments and isolation

| Item | Staging requirement |
| --- | --- |
| Shopify store | A separate Shopify development store, never the live merchant store |
| Shopify app | A separate app/client ID linked to the staging store |
| Backend | A separate HTTPS staging URL and isolated database |
| App proxy | Dedicated `/apps/alfajr-cod-staging` so the staging app does not collide with the original app already installed on the development store |
| Theme extension | Deploy and enable this PR's COD block only in the staging store's test theme |
| Meta | A dedicated test Pixel/dataset, isolated CAPI token and `META_TEST_EVENT_CODE`; never the production Pixel or token |
| Test products | Test variants and shipping configuration in the staging store |

The staging app configuration must have its own `client_id`,
`application_url`, `auth.redirect_urls` and `app_proxy.url`. Store staging
secrets in its runtime's secret manager; never commit them to GitHub.
For the staging app block in the development theme editor, set the advanced
**app proxy subpath** field to `alfajr-cod-staging`; the default `alfajr-cod`
remains unchanged for the original app. Check both app blocks if they appear
in the theme to avoid placing a duplicate COD checkout button on one page.
Use an isolated database because the app handles app sessions, Meta settings,
idempotency keys and COD order records.

Before running Shopify CLI commands or provisioning anything, confirm the
development store domain, separate app identity, staging backend URL, database
and the proposed command/target with the owner. The CLI is not required to
prepare this plan. No Shopify app deployment, theme publication or Meta
configuration change is part of this Draft PR.

## Checks before a staging test order

1. Confirm the Meta test Pixel is configured in the staging app settings and
   browser Pixel sending is enabled for the staging store only.
2. Confirm the `consent-tracking-api` is available and the test storefront has
   a way to grant/deny marketing consent. Verify what
   `Shopify.customerPrivacy.marketingAllowed()` actually returns in each case.
3. In Meta Events Manager's **Test events** panel, use the staging Pixel's
   test event code in staging server settings; use browser devtools to check
   outgoing requests to Meta and `/apps/alfajr-cod-staging/api/cod`.
4. Confirm the Shopify order will be a test order in the **development store**;
   do not use a real customer phone/email or a live inventory item.

## Acceptance scenarios

| Scenario | Expected browser events | Expected Meta CAPI | Expected Shopify outcome |
| --- | --- | --- | --- |
| No input in COD modal, consent granted | No `InitiateCheckout` | No `Purchase` | No order |
| First COD field input, consent granted | One `InitiateCheckout` | No `Purchase` yet | No order |
| More input or repeated field changes | Still only one `InitiateCheckout` | No `Purchase` yet | No order |
| First input while consent denied, then grant while modal stays open | One `InitiateCheckout` after consent | No `Purchase` yet | No order |
| First input while consent denied, keep denied, submit | No Meta events | No CAPI request | **One completed COD order** |
| Consent API unavailable, submit | No Meta events | No CAPI request | **One completed COD order** |
| Consent granted, submit valid order | One `InitiateCheckout` and one `Purchase` | One `Purchase` | **One completed COD order** |
| Re-submit with the same idempotency key | No duplicate order | No duplicate `Purchase` | Same prior response/order |

For a granted-consent purchase, check the browser `Purchase` and CAPI
`Purchase` share the same `event_id`, `currency` and order value. Confirm
Meta deduplicates the two delivery paths. Note that Meta may take time to show
events and the Test Events display is not a guarantee of future attribution.

## Security and compliance limitations

- The frontend sends a **boolean snapshot** of
  `Shopify.customerPrivacy.marketingAllowed()`. The backend validates that
  field and sends no CAPI request unless it is exactly `true`.
- This is **not a tamper-proof consent receipt**: the app proxy cannot read
  the storefront's consent cookies. A malicious client could falsify the
  submitted boolean. Review an independently verifiable consent mechanism if
  the store's compliance requirements demand one.
- The COD block currently collects URL attribution and `_fbp` / `_fbc`
  information into local storage even when Meta transmission is suppressed.
  Review this storage against the store's privacy policy, banner and regional
  requirements separately before production rollout.
- Do not infer consent from the absence of a banner. If the privacy API is
  unavailable, the Meta tracking path must fail closed while order creation
  still succeeds.

## After tests

Record screenshots or timestamps for each Test Events case, the staging order
ID, and the consent state. Clean up test orders/data in the development store
according to store policy. Leave the PR in Draft until the owner explicitly
approves any production merge and deployment; **neither happens here**.
