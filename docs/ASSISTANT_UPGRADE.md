# Shopping assistant upgrade — 10 September 2026

Released to the storefront as `assistant-shopping-continuity`. The worker runs the code from commit e87a9ed. The forwarding/admin application uses the tested f518f2e build; its request schemas are unchanged by e87a9ed.

## Customer features

- Product-page context is resolved against the server catalogue; client descriptions and prices are not trusted.
- Conversation continuity uses sessionStorage in the same tab, with a two-hour inactivity expiry. It retains six history entries, twelve displayed messages and four product cards. Restored cards reload current prices. Pending cart operations are never restored.
- Customers can select up to three products for comparison using published technical information and live variant prices.
- Complementary stationery suggestions come from available catalogue products. Unverified refill/printer compatibility is handed to the store's WhatsApp contact.
- Shipping and returns answers use a reviewed snapshot of the store pages. Update `assistant/shopping.mjs` when those policies change; they are not synchronized automatically.

## Merchant statistics

Open the Shopify app and select **Assistant · Statistiques**. The authenticated `/app/assistant` page displays thirty days of aggregate messages, suggestions, unanswered search categories and browser-reported cart additions. These are not order or revenue figures. No chat text or visitor identifiers are stored in the metrics file.

The worker's protected `/stats` endpoint requires its internal bearer token. Data persists at `/var/lib/alfajr-assistant/metrics.json`, managed through systemd `StateDirectory=alfajr-assistant`.

Nginx routes admin paths matching `^/app(?:/|\.data|$)` to the assistant application on port 3005. Existing static assets are served first, with new asset hashes falling back to port 3005. Public COD traffic remains on port 3003.

## Maintenance and validation

Edit `assistant/widget-source.js` and `assistant/extras-source.js`, then run `node assistant/build-widget.mjs`. The generated extension scripts are minified to stay within Shopify's per-file validation limit.

The full suite passed 104 tests before deployment. The subsequent continuity and comparison refinements passed the relevant widget and core suites; extension validation revision 9 passed all five assistant files. Live checks confirmed comparison replies, product context, protected and persisted statistics, and COD health.

Upgrade backups are under `/var/www/backups/alfajr-shopping-upgrade-f518f2e`. They contain the previous worker, service, application build and Nginx configuration. Preserve the current metrics file when rolling back.

## Conversation review

The app navigation now includes Assistant · Conversations. New widget sessions send a random conversation identifier, unrelated to customer accounts. Only requests with that identifier are recorded, so older widget versions continue without transcript logging. No IP, customer account, name or contact fields are collected. Common phone/email formats and explicitly introduced names/addresses are redacted before storage; free-form redaction is heuristic and cannot guarantee anonymity. The storefront privacy notice explains retention and merchant review.

Protected worker endpoint `/conversations?page=1` returns twenty conversations per page, authenticated through the admin route. Text is rendered escaped by React. Storage is `/var/lib/alfajr-assistant/conversations.json` (0600), atomic writes with hourly expiry and shutdown flush. Retention is up to thirty days, bounded to 500 conversations, 40 turns per conversation and 5,000 total turns; older entries can be removed earlier at these limits. Existing backups do not include this new data file. Browser network errors and cart-confirmation UI messages are not conversation turns.

Validation: 109 tests passed, production build passed, extension validation passed three changed files.
