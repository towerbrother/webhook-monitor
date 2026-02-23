# Infrastructure

Infrastructure setup, deployment strategy, and operational documentation.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Deployment Strategy](#deployment-strategy)
- [Environment Configuration](#environment-configuration)
- [Database Management](#database-management)
- [Monitoring and Observability](#monitoring-and-observability)

---

## Architecture Overview

### Runtime Boundaries

Three independent applications requiring separate deployments:

```
apps/
├── api/       # Fastify HTTP API (handles HTTP requests)
├── worker/    # BullMQ background processor (no HTTP endpoints)
└── web/       # Next.js frontend application (SSR + client)
```

**Key principle:** Apps cannot import from each other (enforced in `AGENTS.md`)

### Shared Infrastructure

**Packages (shared code):**

```
packages/
├── db/        # Prisma client (PostgreSQL)
├── queue/     # BullMQ client (Redis)
├── shared/    # Shared utilities and types
└── *-config/  # Shared configurations (ESLint, TypeScript)
```

**External services:**

- **PostgreSQL** - Primary database (via Prisma ORM)
- **Redis** - Cache and job queue (via BullMQ)

### Communication Pattern

```
┌─────────┐     HTTP      ┌──────────┐
│   Web   │ ◄───────────► │   API    │
└─────────┘               └──────────┘
                               │
                               │ Enqueue jobs
                               ▼
                          ┌──────────┐
                          │  Redis   │
                          │  Queue   │
                          └──────────┘
                               │
                               │ Process jobs
                               ▼
                          ┌──────────┐
                          │  Worker  │
                          └──────────┘
                               │
                               │ Read/Write
                               ▼
                          ┌──────────┐
                          │   DB     │
                          └──────────┘
```

**Rules:**

- API must never perform long-running work (enqueue to worker)
- Worker must never expose HTTP endpoints (use API for external access)
- Web fetches data from API (no direct DB access)

---

## Deployment Strategy

**Status:** Planned

### Platform Options

#### Option 1: Vercel (Frontend) + Railway (Backend) ⭐ Recommended

**Frontend (`apps/web`):**

- **Platform:** Vercel
- **Benefits:**
  - Native Next.js support (built by Vercel)
  - Automatic preview deployments for PRs
  - Edge network for global performance
  - Zero-config deployment
- **Pricing:** Generous free tier, $20/month Pro

**Backend (`apps/api` + `apps/worker`):**

- **Platform:** Railway
- **Setup:**
  - Separate services for API and worker
  - Managed PostgreSQL and Redis add-ons
  - Easy monorepo support
- **Benefits:**
  - Simple configuration
  - GitHub integration
  - Automatic HTTPS
- **Pricing:** Pay-as-you-go ($5 free credit monthly)

**Pros:**

- Best-in-class Next.js hosting
- Simple backend deployment
- Cost-effective for small-medium traffic

**Cons:**

- Split across two platforms
- Requires environment variable sync

#### Option 2: Single Platform (Railway or Render)

**All apps on one platform:**

- Railway or Render for all services
- Unified dashboard and billing
- Shared PostgreSQL and Redis instances

**Pros:**

- Centralized configuration
- Single bill and management console
- Easier environment variable management

**Cons:**

- Next.js performance may not match Vercel
- Slightly more complex monorepo setup

#### Option 3: Docker + Self-Hosted (VPS or Cloud)

**Approach:**

- Docker images for each app
- Docker Compose or Kubernetes orchestration
- Deploy to DigitalOcean, AWS, GCP, etc.

**Pros:**

- Full control and flexibility
- Most cost-effective for high traffic
- Can optimize for specific needs

**Cons:**

- Requires infrastructure management
- More complex CI/CD setup
- Manual scaling and monitoring

### Recommended Phased Approach

**Phase 1 (Current):** Local development and manual testing

**Phase 2:** Deploy to staging

- Vercel for web (automatic via GitHub integration)
- Railway for api + worker

**Phase 3:** Production deployment

- Same setup as staging
- Add custom domain
- Enable monitoring

**Phase 4:** Scale as needed

- Evaluate traffic patterns
- Optimize based on costs
- Consider migration if needed

### Deployment Workflow (Planned)

**File:** `.github/workflows/deploy.yml`

```yaml
on:
  push:
    branches: [main]

jobs:
  deploy-web:
    runs-on: ubuntu-latest
    steps:
      - Deploy to Vercel (automatic via integration)

  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - Build API container
      - Deploy to Railway

  deploy-worker:
    runs-on: ubuntu-latest
    steps:
      - Build worker container
      - Deploy to Railway
```

**Triggers:**

- Automatic: Merges to `main` branch
- Manual: Workflow dispatch for hotfixes

### Health Checks

Each service should expose health endpoints:

**API (`apps/api`):**

```typescript
// GET /health
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "uptime": 12345
}
```

**Worker (`apps/worker`):**

- Redis connectivity check
- Queue processing status
- Expose via internal monitoring (not HTTP)

**Web (`apps/web`):**

- Vercel automatic health monitoring
- Next.js built-in health checks

---

## Environment Configuration

### Environment Variables

#### Required for All Environments

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379
```

#### Per-Application Variables

**`apps/api`:**

```bash
PORT=3000
API_KEY=secret-key
CORS_ORIGINS=https://app.example.com
```

**`apps/worker`:**

```bash
CONCURRENCY=5
JOB_TIMEOUT=60000
```

**`apps/web`:**

```bash
NEXT_PUBLIC_API_URL=https://api.example.com
```

### Local Development Setup

**Expected database URL:**

```
postgresql://postgres:postgres@localhost:5432/webhook_monitor
```

**Setup steps:**

1. Start PostgreSQL and Redis: `docker compose up -d`
2. Copy `.env.example` to `.env` (if exists)
3. Update connection strings (default values work with docker-compose.yml)
4. Run migrations: `pnpm --filter @repo/db prisma migrate dev`

**Docker Compose:** The repo includes `docker-compose.yml` for local PostgreSQL and Redis instances.

### Managing Secrets

**Local development:**

- Use `.env` files (gitignored)
- Template provided in `.env.example` (when created)

**Production:**

- Use platform environment variable UI (Vercel, Railway)
- Never commit secrets to repository
- Rotate keys regularly

**CI/CD:**

- Store in GitHub Secrets
- Reference in workflow files

---

## Database Management

### Technology

**ORM:** Prisma  
**Database:** PostgreSQL  
**Package:** `packages/db`

### Schema Management

**File:** `packages/db/prisma/schema.prisma`

**Workflow:**

1. Edit schema file
2. Generate client: `pnpm --filter @repo/db prisma generate`
3. Create migration: `pnpm --filter @repo/db prisma migrate dev --name description`
4. Commit schema + migration files

### Migrations

**Local development:**

```bash
pnpm --filter @repo/db prisma migrate dev
```

**Production (when implemented):**

```bash
pnpm --filter @repo/db prisma migrate deploy
```

**Important decisions needed:**

- Run migrations in CI or during deployment?
- Rollback strategy for failed migrations?
- Backup strategy before migrations?

### Database Backups

**Status:** Not yet configured

**Recommendations:**

**Managed hosting (Railway/Render):**

- Enable automatic daily backups
- Test restore process monthly

**Self-hosted:**

- `pg_dump` scheduled via cron
- Store backups in S3 or similar
- Retention: 7 daily, 4 weekly, 12 monthly

---

## Monitoring and Observability

**Status:** Not yet implemented

### Logging Strategy

**Approach:** Structured JSON logs

**Log levels:**

```typescript
- error: Application errors (requires attention)
- warn: Warnings (review periodically)
- info: Important events (user actions, system events)
- debug: Detailed debugging (development only)
```

**Log format:**

```json
{
  "level": "error",
  "timestamp": "2026-02-08T10:30:00Z",
  "message": "Failed to process webhook",
  "service": "worker",
  "error": {
    "message": "Connection timeout",
    "stack": "..."
  },
  "context": {
    "webhookId": "123",
    "userId": "456"
  }
}
```

### Metrics to Track

**Application Performance:**

- API response times (p50, p95, p99)
- Request throughput (requests/sec)
- Error rates (by endpoint)

**Background Jobs:**

- Queue length
- Job processing time
- Success/failure rates
- Retry attempts

**Database:**

- Query execution time
- Connection pool usage
- Slow query log

**Infrastructure:**

- CPU usage
- Memory usage
- Disk I/O

### Monitoring Tools (Options)

**Error Tracking:**

- **Sentry:** Best-in-class error tracking ($26/month)
- **Rollbar:** Alternative error monitoring
- **LogRocket:** Session replay + errors

**Application Performance Monitoring (APM):**

- **Datadog:** Comprehensive monitoring (expensive)
- **New Relic:** Full-stack observability
- **Grafana Cloud:** Open-source option

**Log Aggregation:**

- **Logtail:** Simple log management ($5/month)
- **Datadog Logs:** Integrated with APM
- **Loki:** Self-hosted (open-source)

**Uptime Monitoring:**

- **UptimeRobot:** Free for 50 monitors
- **Pingdom:** Professional uptime monitoring
- **StatusCake:** Alternative uptime service

### Alerting Strategy

**Critical alerts (immediate notification):**

- Application crashes
- Database connection failures
- High error rates (>5%)
- Worker queue backing up (>1000 jobs)

**Warning alerts (review daily):**

- Elevated error rates (>1%)
- Slow response times (>2s p95)
- High resource usage (>80% CPU/memory)

**Channels:**

- Email for non-critical
- Slack/Discord for warnings
- PagerDuty for critical (if 24/7 support needed)

---

## Disaster Recovery

**Status:** Not yet planned

### Backup Strategy

**Database:**

- Automated daily backups (retain 30 days)
- Weekly full backups (retain 12 weeks)
- Test restore process monthly

**Redis:**

- Not critical (cache + ephemeral queue data)
- Enable AOF persistence for queue durability
- Can rebuild from source data

**Code:**

- GitHub is source of truth
- Tag releases: `git tag v1.0.0`

### Recovery Procedures

**Database corruption:**

1. Stop all services
2. Restore from latest backup
3. Replay Redis queue if needed
4. Restart services

**Service outage:**

1. Check health endpoints
2. Review error logs
3. Rollback to previous version if needed
4. Investigate root cause

**Data loss:**

- Database: Restore from backup
- Redis: Rebuild from database
- Code: Revert to last known good commit

---

## Security Considerations

### Application Security

**API:**

- Rate limiting (prevent abuse)
- Input validation (prevent injection)
- Authentication/authorization
- HTTPS only (no HTTP)

**Database:**

- Use connection pooling (prevent exhaustion)
- Parameterized queries (via Prisma, automatic)
- Least privilege access (app-specific DB user)

**Secrets:**

- Never commit to repository
- Rotate regularly (quarterly)
- Use environment variables

### Network Security

**Firewall rules:**

- Allow only necessary ports
- Whitelist known IPs (if applicable)
- Block direct database access from internet

**SSL/TLS:**

- Use Let's Encrypt for free certificates
- Enforce HTTPS redirects
- Enable HSTS headers

---

## Cost Optimization

### Current Setup (Development)

**Cost:** $0 (local development)

### Estimated Production Costs

**Option 1 (Vercel + Railway):**

- Vercel: $0-20/month
- Railway: $5-50/month (depends on usage)
- Total: ~$5-70/month

**Option 2 (Single platform):**

- Railway/Render: $10-100/month
- Total: ~$10-100/month

**Option 3 (Self-hosted):**

- VPS: $5-20/month (DigitalOcean, Linode)
- Database: $15/month (managed) or included in VPS
- Total: ~$20-35/month

### Optimization Tips

**Reduce costs:**

- Use free tiers where possible
- Right-size infrastructure (don't over-provision)
- Enable caching (reduce database load)
- Optimize images (reduce bandwidth)

**Monitor usage:**

- Set billing alerts
- Review usage monthly
- Scale down unused resources

---

## Related Documents

- [Automation](./automation.md) - CI/CD and Renovate
- [Development](./development.md) - Development workflows
- [`AGENTS.md`](../AGENTS.md) - Architecture rules
