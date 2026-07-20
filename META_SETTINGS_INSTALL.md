# Install the merchant Meta settings update

1. Replace the patched files or deploy the full project archive.
2. Add a stable server secret:

```env
META_SETTINGS_ENCRYPTION_KEY=use-a-long-random-secret
META_GRAPH_API_VERSION=v25.0
```

`SHOPIFY_API_SECRET` is used as the encryption-key source when `META_SETTINGS_ENCRYPTION_KEY` is omitted.

3. Apply the database migration and regenerate Prisma Client:

```bash
npm install
npm run setup
```

4. Deploy the Shopify app and theme extension:

```bash
npm test
npm run build
npm run deploy
pm2 restart alfajr-cod-form --update-env
```

5. In Shopify Admin, open **AL FAJR COD → Meta Pixel** and enter the merchant's own:
   - Meta Pixel ID
   - Conversions API access token
   - Optional Test Event Code

6. Place one COD test order and verify the server and browser `Purchase` events in Meta Events Manager.
7. Remove the Test Event Code after testing.

The CAPI token is encrypted in PostgreSQL and is never exposed to the storefront.
