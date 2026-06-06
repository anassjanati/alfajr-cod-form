# AL FAJR COD Form - Production Deployment Guide

## Overview

This app is now ready for production deployment. This guide covers database setup, environment configuration, and deployment strategies.

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm or yarn
- A Shopify Partner account
- A development or staging Shopify store for testing

## Database Setup

### Development (Local)

By default, the app uses SQLite with the file `prisma/dev.sqlite`. This works for single-instance development and testing.

```bash
npm run setup
```

### Production Database

For production, you **must** use a distributed database like PostgreSQL or MySQL. SQLite does not support concurrent write access and will cause issues in production.

#### Option 1: PostgreSQL (Recommended)

1. **Create a PostgreSQL database:**

```bash
# Using managed service like Railway, Render, or AWS RDS
# Get your connection string: postgresql://user:password@host:port/database
```

2. **Update `prisma/schema.prisma`:**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

3. **Set environment variable:**

```bash
export DATABASE_URL="postgresql://user:password@host:port/database"
```

4. **Run migrations:**

```bash
npx prisma migrate deploy
```

#### Option 2: MySQL

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

Connection string format:
```
mysql://user:password@host:port/database
```

## Environment Variables

Create a `.env.production` file with the following variables:

```env
# Shopify API credentials (from your Partner dashboard)
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_APP_URL=https://your-production-url.com

# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Optional
SCOPES=read_orders,write_orders,write_products,write_metaobject_definitions,write_metaobjects
SHOP_CUSTOM_DOMAIN=optional-custom-domain.com
```

### Validating Environment Variables

The app validates required environment variables on startup. If any are missing, it will throw an error with a clear message.

```
Error: Missing required environment variable: SHOPIFY_API_KEY
```

## Deployment Options

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

Configure in `vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "env": {
    "SHOPIFY_API_KEY": "@shopify_api_key",
    "SHOPIFY_API_SECRET": "@shopify_api_secret",
    "SHOPIFY_APP_URL": "@shopify_app_url",
    "DATABASE_URL": "@database_url"
  }
}
```

### Option 2: Fly.io

```bash
# Install Fly CLI
# Deploy using Fly documentation: https://fly.io/docs/js/shopify/
```

### Option 3: Google Cloud Run

Follow [Shopify's Cloud Run guide](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run)

## Post-Deployment Checklist

- [ ] Environment variables set correctly
- [ ] Database migrations applied
- [ ] Test order creation from COD form
- [ ] Verify webhook delivery in Shopify Partner dashboard
- [ ] Check application logs for errors
- [ ] Confirm idempotency tracking working (check IdempotentRequest table)
- [ ] Verify rate limiting active (try multiple requests rapidly)
- [ ] Test from different client (shop) domains

## Monitoring & Logging

### Structured Logs

The app outputs structured JSON logs. Each log entry includes:

```json
{
  "timestamp": "2024-05-30T12:34:56.789Z",
  "level": "info|error|warn",
  "message": "Human-readable message",
  "context": { "service": "api.cod", "endpoint": "/api/cod" },
  "...": "Additional fields depend on context"
}
```

Parse logs using:
```bash
# View recent errors
cat app.log | jq 'select(.level=="error")'
```

### Key Metrics to Monitor

1. **Order Creation Success Rate**
   - Monitor `message: "Order created successfully"` logs
   - Alert if success rate drops below 95%

2. **Validation Failures**
   - Monitor `message: "Validation failed"` logs
   - High validation failures may indicate client-side issues

3. **Rate Limit Hits**
   - Monitor `message: "Rate limit exceeded"` logs
   - Increase limit if legitimate traffic is blocked

4. **Idempotency Cache Hits**
   - Monitor `message: "Idempotent request detected"` logs
   - Indicates retries happening

5. **Database Errors**
   - Monitor `level: "error"` logs with database context
   - Check PostgreSQL query performance

## Database Maintenance

### Cleanup Expired Idempotency Requests

The app tracks requests for 24 hours. Run this periodically to clean old records:

```sql
DELETE FROM IdempotentRequest WHERE expiresAt < NOW();
```

Or schedule via Prisma:

```javascript
// In a scheduled job
await prisma.idempotentRequest.deleteMany({
  where: { expiresAt: { lt: new Date() } }
});
```

### Backup Strategy

- **Daily backups** of PostgreSQL database
- Test restore procedures weekly
- Keep 7 days of backups minimum

## Troubleshooting

### "Missing required environment variable" error

Check all variables in `.env.production` are set:
```bash
echo $SHOPIFY_API_KEY
echo $SHOPIFY_API_SECRET
echo $SHOPIFY_APP_URL
echo $DATABASE_URL
```

### Database connection timeouts

- Verify DATABASE_URL is correct
- Check network connectivity from app to database
- Verify database credentials have correct permissions
- Increase connection pool size if high concurrency

### Orders not creating

Check logs:
```bash
# Look for validation errors
cat app.log | jq 'select(.level=="error") | select(.message="Validation failed")'

# Look for Shopify API errors
cat app.log | jq 'select(.context.endpoint=="/api/cod")'
```

### Rate limit too aggressive

Update in `app/routes/api.cod.jsx`:
```javascript
const { allowed, remaining, resetTime } = checkRateLimit(shop, 30, 60); // Increase from 20 to 30
```

## Migration from Development

To migrate from development SQLite to production PostgreSQL:

1. Export data from SQLite:
```bash
sqlite3 prisma/dev.sqlite ".dump" > backup.sql
```

2. Verify data integrity:
```bash
npx prisma db push --preview-feature
```

3. Deploy PostgreSQL changes:
```bash
export DATABASE_URL="your_production_db"
npx prisma migrate deploy
```

## Security Recommendations

- [ ] Enable HTTPS (handled by host provider)
- [ ] Use strong database passwords (20+ characters, mixed case)
- [ ] Restrict database access to app server IP only
- [ ] Enable database backups with encryption
- [ ] Monitor access logs regularly
- [ ] Rotate API secrets quarterly
- [ ] Use environment-specific API keys (never share production keys)

## Support

For issues:
1. Check application logs
2. Verify environment variables
3. Test database connectivity
4. Review [Shopify documentation](https://shopify.dev/docs/apps/launch/deployment)
