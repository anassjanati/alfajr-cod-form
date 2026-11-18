# Merchant-configurable Meta Purchase tracking

Each Shopify merchant can configure their own Meta data source from:

**AL FAJR COD → Meta Pixel**

The app saves one isolated Meta configuration per `shop` and uses it only for that shop's COD orders.

## Merchant fields

- **Meta Pixel ID**
- **Conversions API access token**
- **Browser Purchase toggle**
- **Test Event Code** for temporary Events Manager testing
- Enable/disable tracking

The access token is encrypted with AES-256-GCM before it is stored. The loader returns only `hasAccessToken`; the encrypted value and plaintext token are never returned to the Shopify Admin UI, Liquid, or storefront JavaScript.

## Purchase flow

After Shopify successfully converts the Draft Order into a real Order:

1. The app loads the Meta configuration belonging to the authenticated shop.
2. It sends a server-side Conversions API `Purchase` using the final Shopify total, including shipping.
3. The API response exposes only the public Pixel ID when browser tracking is enabled.
4. The storefront sends a browser `Purchase` with the same `event_id` using `trackSingle` for that merchant's Pixel.
5. Meta can deduplicate the browser and server copies.
6. The app stores the last server delivery status in the merchant dashboard.

Meta failures never cancel a valid Shopify order.

## COD InitiateCheckout flow

The COD app block prefetches the merchant's browser Pixel configuration from
`GET /apps/alfajr-cod/api/meta-config` when the modal opens. The signed Shopify
app proxy identifies the shop; its JSON response includes only
`{ browserEnabled, pixelId }` and is never cached. No CAPI access token is
exposed through this endpoint.

On the **first customer input** in each newly opened COD form, the block sends
Meta's standard browser `InitiateCheckout` event to that merchant's Pixel via
`fbq('trackSingle', ...)`. It includes currency `MAD`, cart items and the
estimated total (products plus shipping). The existing `cod_form_start`
custom event remains for non-Meta reports.

Browser Meta events (including `Purchase` and custom `cod_*` events) require
`Shopify.customerPrivacy.marketingAllowed()` to return true. If the consent
API is unavailable or denies marketing consent, the block does not send a
browser Meta event. The block loads Shopify's `consent-tracking-api` using
`Shopify.loadFeatures` before making that decision. The server `Purchase` delivery remains best-effort as
before; review CAPI consent handling separately for stores in regulated regions.

To test after deploying **both the server app and theme app extension**:

1. Open the storefront and enable marketing consent where required.
2. Open the COD modal and start typing in the customer fields.
3. In Meta Events Manager → Test Events, verify one `InitiateCheckout` for the
   configured Pixel (no event before input, no duplicates for subsequent typing).
4. Submit one real test COD order and verify `Purchase` has matching browser
   and CAPI event IDs. Re-test with marketing consent denied; no browser Meta
   events should be sent.
5. Check any hardcoded theme-level Pixel initialization separately to avoid
   loading the same Pixel twice alongside this app extension.

## Production setup

Deploy the included Prisma migration:

```bash
npm run setup
```

Set a stable encryption secret on the server:

```env
META_SETTINGS_ENCRYPTION_KEY=GENERATE_A_LONG_RANDOM_SECRET
META_GRAPH_API_VERSION=v25.0
```

Do not rotate `META_SETTINGS_ENCRYPTION_KEY` after merchants have stored tokens unless you first decrypt and re-encrypt the existing values. If this variable is omitted, the code derives the encryption key from `SHOPIFY_API_SECRET`.

Then deploy and restart:

```bash
npm test
npm run build
npm run deploy
pm2 restart alfajr-cod-form --update-env
```

## Merchant setup

1. Open Meta Events Manager.
2. Select the merchant's data source.
3. Copy the Pixel ID.
4. Generate a Conversions API access token.
5. Open **AL FAJR COD → Meta Pixel**.
6. Paste both values and enable tracking.
7. Optionally paste a Test Event Code and place one COD order.
8. Confirm the `Purchase` in Meta Test Events.
9. Remove the Test Event Code and save again.

A Pixel ID alone is not enough for reliable server-side order optimization. The merchant must also add the Conversions API token.

## Legacy single-shop environment variables

The original environment-based configuration remains available only as a controlled migration bridge:

```env
META_LEGACY_SHOP=the-original-shop.myshopify.com
META_PIXEL_ID=...
META_CAPI_ACCESS_TOKEN=...
META_TEST_EVENT_CODE=
```

The credentials are ignored for every other shop, preventing one merchant's orders from being sent to another merchant's Pixel.

## Relevant files

- `prisma/schema.prisma`
- `prisma/migrations/20260719224500_add_meta_tracking_settings/migration.sql`
- `app/Services/meta-settings.service.js`
- `app/Services/meta.service.js`
- `app/routes/app._index.jsx`
- `app/routes/api.cod.jsx`
- `app/routes/api.meta-config.jsx`
- `extensions/cod-form/blocks/cod_form.liquid`
