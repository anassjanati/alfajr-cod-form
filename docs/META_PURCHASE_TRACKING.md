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
- `extensions/cod-form/blocks/cod_form.liquid`
