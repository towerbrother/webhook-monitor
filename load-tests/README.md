# Load Testing Suite

Comprehensive load tests for the webhook monitor system.

## Prerequisites

Install k6:

```bash
# macOS
brew install k6

# Windows
choco install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

## Setup

1. Start the system:

```bash
# Terminal 1: Infrastructure
docker compose up -d

# Terminal 2: API
pnpm --filter @repo/api dev

# Terminal 3: Worker
pnpm --filter @repo/worker dev
```

2. Create test data:

```sql
-- In PostgreSQL (psql)
INSERT INTO "Project" (id, name, "projectKey")
VALUES ('proj_test', 'Load Test Project', 'test-key-123');

INSERT INTO "WebhookEndpoint" (id, url, name, "projectId")
VALUES ('ep_test123', 'http://httpbin.org/post', 'Test Endpoint', 'proj_test');
```

3. Set environment variables:

```bash
export BASE_URL=http://localhost:3000
export PROJECT_KEY=test-key-123
export ENDPOINT_ID=ep_test123
```

## Tests

### 1. Load Test (Progressive Load)

**Purpose**: Measure throughput and latency under increasing load.

**Duration**: ~9 minutes

**Run**:

```bash
k6 run k6-load-test.js
```

**What it tests**:

- API response times under load
- Throughput capacity
- System behavior as load increases
- P95/P99 latencies

**Success criteria**:

- P95 latency < 200ms
- Error rate < 1%
- No crashes or connection errors

---

### 2. Stress Test (Find Breaking Point)

**Purpose**: Find the maximum load the system can handle.

**Duration**: ~17 minutes

**Run**:

```bash
k6 run k6-stress-test.js
```

**What it tests**:

- Maximum throughput before failure
- System behavior at capacity
- Error handling under extreme load
- Recovery behavior

**Success criteria**:

- Identify breaking point (requests/sec)
- Error rate < 10% at peak
- System remains responsive

**Expected outcome**:

- At some point, latency spikes or errors increase
- This is your baseline capacity
- Use this to plan for horizontal scaling

---

### 3. Spike Test (Traffic Burst)

**Purpose**: Test resilience to sudden traffic spikes.

**Duration**: ~6 minutes

**Run**:

```bash
k6 run k6-spike-test.js
```

**What it tests**:

- Handling sudden 50x traffic increase
- Queue backlog behavior
- Recovery after spike
- Resource exhaustion

**Success criteria**:

- System survives spike without crashing
- Latency increases but requests still succeed
- Queue absorbs burst (Redis depth increases)
- System recovers after spike

**Watch for**:

- Database connection pool exhaustion
- Redis memory usage spike
- Worker queue backlog

---

### 4. Soak Test (Long-term Stability)

**Purpose**: Verify system stability over extended periods.

**Duration**: 2+ hours

**Run**:

```bash
k6 run k6-soak-test.js
```

**What it tests**:

- Memory leaks
- Connection leaks
- Resource exhaustion over time
- Log disk usage growth

**Success criteria**:

- No memory leaks (memory stays flat)
- No connection leaks (pool size stable)
- No performance degradation over time
- Error rate remains < 1%

**Monitor**:

```bash
# Memory usage
docker stats

# Database connections
SELECT count(*) FROM pg_stat_activity;

# Redis memory
redis-cli INFO memory

# Worker queue depth
redis-cli LLEN bull:webhook-delivery:wait
```

---

## Monitoring During Tests

### 1. API Health

```bash
# Response times
curl http://localhost:3000/health

# Fastify metrics (if enabled)
curl http://localhost:3000/metrics
```

### 2. Database

```sql
-- Connection count
SELECT count(*) FROM pg_stat_activity WHERE datname = 'webhook_monitor';

-- Slow queries
SELECT query, query_start, now() - query_start AS duration
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '1 second';

-- Lock contention
SELECT * FROM pg_locks WHERE NOT granted;
```

### 3. Redis

```bash
redis-cli

# Memory usage
INFO memory

# Queue depth
LLEN bull:webhook-delivery:wait
LLEN bull:webhook-delivery:active
LLEN bull:webhook-delivery:failed

# Connection count
INFO clients

# All keys
KEYS bull:webhook-delivery:*
```

### 4. Worker

```bash
# Check logs for processing rate
pnpm --filter @repo/worker dev

# Look for:
# - "Processing webhook delivery job" (rate)
# - "Webhook delivery successful" (success rate)
# - "Webhook delivery failed" (failure rate)
```

---

## Interpreting Results

### Good Results

```
http_req_duration.............: avg=45ms  min=20ms med=40ms max=500ms p(90)=80ms  p(95)=120ms
http_req_failed...............: 0.00%   ✓ 0        ✗ 10000
http_reqs.....................: 10000   166.67/s
```

- Low average latency (<100ms)
- Low P95 latency (<200ms)
- Zero failures
- Consistent throughput

### Warning Signs

```
http_req_duration.............: avg=450ms min=20ms med=200ms max=30s   p(90)=2s    p(95)=5s
http_req_failed...............: 2.50%   ✓ 250      ✗ 9750
http_reqs.....................: 10000   50/s
```

- High P95/P99 (> 1s) → Bottleneck
- Non-zero failures → Errors or timeouts
- Decreasing throughput → System saturated
- High max time (30s) → Timeouts

### Troubleshooting

**High latency, low errors**:

- Database connection pool exhausted → Increase pool size
- Slow queries → Add indexes, optimize queries
- CPU saturation → Scale horizontally

**High error rate**:

- 401/403 errors → Check project key
- 404 errors → Check endpoint exists
- 500 errors → Check API logs for exceptions
- Connection refused → API crashed or overloaded

**Inconsistent results**:

- Database or Redis restarted → Wait for warm-up
- Garbage collection pauses → Tune Node.js heap
- Disk I/O spikes → Check logging verbosity

---

## Advanced Testing

### Test with Realistic Payloads

```javascript
// Modify k6 scripts to use realistic webhook data
const payload = JSON.stringify({
  event: "order.created",
  id: `order_${Date.now()}`,
  timestamp: new Date().toISOString(),
  data: {
    orderId: `ord_${Math.random()}`,
    customerId: `cus_${__VU}`,
    items: Array.from({ length: 5 }, (_, i) => ({
      id: `item_${i}`,
      name: `Product ${i}`,
      price: Math.floor(Math.random() * 10000),
      quantity: Math.floor(Math.random() * 5) + 1,
    })),
    total: Math.floor(Math.random() * 50000),
    currency: "USD",
    metadata: {
      source: "web",
      campaign: "summer2026",
      affiliate: `aff_${Math.random()}`,
    },
  },
});
```

### Test Idempotency Under Load

```javascript
// Send duplicate requests to test idempotency handling
const idempotencyKey = `test-${__ITER}`; // Same key per iteration

// First request: 201
// Subsequent requests: 409
```

### Test Retry Logic

```bash
# Set up failing endpoint
node load-tests/mock-failing-server.js

# Update endpoint URL in DB to point to mock server
# Send webhooks and watch retry timing
```

### Test Multi-Tenancy

```javascript
// Use different project keys in rotation
const projectKeys = ["key1", "key2", "key3"];
const key = projectKeys[__VU % projectKeys.length];
```

---

## Baseline Metrics

Record your baseline metrics after optimization:

| Metric          | Target         | Your Result    |
| --------------- | -------------- | -------------- |
| **Throughput**  | 1000 req/s     | **\_\_** req/s |
| **P50 Latency** | <50ms          | **\_\_** ms    |
| **P95 Latency** | <200ms         | **\_\_** ms    |
| **P99 Latency** | <500ms         | **\_\_** ms    |
| **Error Rate**  | <1%            | **\_\_** %     |
| **Max Load**    | Breaking point | **\_\_** req/s |

---

## Next Steps

1. **Identify bottleneck** (database, API, worker?)
2. **Optimize** (indexes, connection pool, caching)
3. **Re-test** and compare results
4. **Scale horizontally** (multiple instances)
5. **Re-test** and measure scaling efficiency

---

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [Load Testing Best Practices](https://k6.io/docs/test-types/introduction/)
- [Grafana k6 Cloud](https://k6.io/cloud/) (for advanced metrics)
