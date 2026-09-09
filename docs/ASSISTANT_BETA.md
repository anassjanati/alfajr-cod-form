# Al Fajr shopping assistant beta

This branch adds a Shopify app embed and a separate Node service on the existing DigitalOcean Droplet. Nothing is enabled by default. Existing COD routes, database schema and Shopify configuration are unchanged.

## How it works

The widget calls `/apps/alfajr-cod/api/assistant`. Shopify forwards it to the existing app's new `/api/assistant` route, which validates the app-proxy signature and the configured store. It forwards a bounded request to the worker on `127.0.0.1:3101` using a private shared token. The worker reads the public Al Fajr products and collection feeds, plans a search with Gemini, and generates a reply from matching products. It does not read customers or orders or execute Shopify mutations.

The widget loads current variants and prices directly from Shopify's product endpoint. The customer chooses variants and quantities, reviews a selection, then confirms with the button or an exact `ok`, `oui`, `yes`, `ah`, `wakha`, `نعم`, `واخا`, `زيدهم` or `واخا زيدهم`. Natural-language consent is deliberately bounded: other wording continues the conversation. Cart additions run in the customer's existing Shopify session. Changed prices require a second confirmation. An uncertain write clears the pending selection and directs the customer to check their cart; no automatic retries.

## Droplet installation

First inspect the actual Droplet's available memory, Node path, existing process manager and networking. This repository does not contain its live configuration. The worker uses an additional process with a 320 MB memory ceiling and 40% of one CPU under systemd; confirm there is sufficient headroom for COD before enabling it. These are ceilings, not reserved capacity. The beta is not a high-availability deployment.

1. Install this branch of the app using the existing app deployment workflow. Build with `npm ci`, `npx prisma generate`, and `npm run build`. Do not change the existing database or migrations for this feature.
2. Install a second copy of the repository at `/opt/alfajr-assistant`, run `npm ci --omit=dev` there, and grant a dedicated unprivileged `alfajr-assistant` user read/execute access. The worker needs only `assistant/core.mjs`, `assistant/server.mjs`, and the `zod` runtime dependency, so it can also be packaged separately.
3. Create `/etc/alfajr-assistant.env` with permissions `0600`, owned by root. Generate a new random 32-byte token (for example `openssl rand -hex 32`). Never place these values in theme settings or commit them:

   ```dotenv
   ASSISTANT_INTERNAL_TOKEN=REPLACE_WITH_RANDOM_SECRET
   GEMINI_API_KEY=REPLACE_WITH_KEY_FROM_AI_STUDIO
   GEMINI_MODEL=REPLACE_WITH_AVAILABLE_FREE_TIER_MODEL
   GEMINI_REQUESTS_PER_MINUTE=4
   GEMINI_REQUESTS_PER_DAY=80
   ASSISTANT_CONCURRENCY=2
   ASSISTANT_PORT=3101
   ```

   Select a model that supports `generateContent` with structured JSON responses and has free quota in this specific Google project. The code does not hardcode a model that might disappear. Check the project's limits in AI Studio and set these local budgets below them. Each successful chat turn uses two Gemini requests. Defaults are conservative beta budgets, not claims about Google's allowances. Missing key/model gives product search only. Restarting the service resets its local budgets; Google's limits remain authoritative.

4. Copy `assistant/alfajr-assistant.service` into `/etc/systemd/system/`, verify `/usr/bin/node` is Node 20.19+ or 22.12+, then run `systemctl daemon-reload` and `systemctl enable --now alfajr-assistant`. The worker binds only to loopback and must never have a public port/firewall rule.
5. Add to the **existing COD app's server environment**, preserving all other settings:

   ```dotenv
   ASSISTANT_ENABLED=true
   ASSISTANT_SHOP=YOUR_CANONICAL_HANDLE.myshopify.com
   ASSISTANT_INTERNAL_TOKEN=SAME_RANDOM_SECRET_AS_WORKER
   ```

   Get the exact canonical shop domain from Shopify Settings → Domains. Do not use `al-fajr.ma` here. Restart the COD app using its existing process manager. If the COD app is in Docker, its loopback is a different network namespace: do not expose port 3101 to the internet. Adjust the private networking and forwarding endpoint for that deployment before enabling this feature; the supplied route assumes both Node processes run directly on the Droplet.
6. Deploy the theme extension through the app's normal `shopify app deploy` workflow. Enable **Al Fajr Assistant Beta** in the theme editor's **App embeds**, preferably in an unpublished theme first. Existing proxy prefix must remain `/apps/alfajr-cod`; if customized, update the embed endpoint accordingly.
7. Run the manual checks below before enabling on the live theme. Keep the server gate off until ready.

## Validation before launch

- Run `npx vitest run` and `npm run build`.
- Open the unpublished theme on mobile and desktop; verify keyboard focus, Escape, variant selection and the COD button remaining usable.
- Ask in French, Arabic and Darija for products from several collections. Check budget relevance and actual product links; translation/retrieval quality is not yet evaluated against real Gemini output.
- Confirm one product and a multi-product selection, then view the actual cart. Check the COD form recognizes those cart lines. Only the cart icon is refreshed generically; a theme-specific drawer integration may be needed. The widget always exposes a direct cart link.
- Simulate sold-out products, a price change, a 429 response, an unavailable worker, and an uncertain cart write. Verify confirmation never repeats the write automatically.
- Check the app-proxy signature, canonical shop allowlist, and internal token rejection in staging. The existing reverse proxy must replace untrusted client-IP headers; validate per-client limiting behind Shopify's proxy. A global limit and bounded in-flight requests still apply.
- Check actual Droplet CPU/memory and COD latency while running a staged load test. Automated tests simulate 40 concurrent cache readers; this is not a measured live shopper capacity.

## Limits and data

- Public feeds provide published storefront products only, not drafts or private inventory. Products and collections are paginated in batches of 250, up to 100 pages per feed. A larger feed fails explicitly rather than silently claiming completeness. All variants exposed by the public feed are retained; current product variants are loaded again by the browser.
- Full product cache refreshes every five minutes. One fetch per feed runs at a time, with bounded cache entries and row counts. On a temporary fetch failure, the last complete result can be served for up to 15 minutes from its original fetch; otherwise there is a 30-second retry cooldown. Current price/availability is always fetched in the browser. Cold starts may temporarily fall back to the shop's native search. Public feed availability/format must be monitored; it is not an Admin API synchronization contract.
- Search is lexical after Gemini translates/expands terms; it is not an embeddings/vector search. Collection search is constrained to an actual returned collection handle. Gemini sees candidate descriptions and at most six history messages. It cannot supply executable cart actions or arbitrary product links.
- Phone/email patterns are redacted on the worker. This is not complete anonymization: free text can include addresses or names. The UI explains Gemini free-tier processing before the first submission and asks users to avoid personal information. Neither server logs chat bodies or keys, and chat history is held only in the tab's memory. Google processes submitted text under its API terms; review the store's customer notice before launch.
- Free Gemini quotas are shared across the project. Local limits, a 60-second circuit breaker on upstream 429/5xx, and a two-conversation AI cap degrade to lexical product search, not unlimited AI availability. No Redis, cross-worker quota enforcement or horizontal autoscaling is included in this beta. Keep one worker.
- Search/card text defaults to French with Darija prompts. Gemini is instructed to follow the shopper's language. Add locale files for fully translated fixed UI labels.
- The worker is process-isolated; its lightweight forwarding route still runs in the COD app. The common Droplet/network remain shared failure points. No live changes, account keys, end-to-end Gemini verification or deployment are included in this checkout.

## Rollback

Disable the app embed and set `ASSISTANT_ENABLED=false` in the COD app, then restart the app normally. Stop the assistant service. No database rollback or COD route change is needed.

## References

- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/pricing
- https://shopify.dev/docs/api/ajax/reference/cart
- https://shopify.dev/docs/api/shopify-app-react-router/latest/authenticate/public/app-proxy
