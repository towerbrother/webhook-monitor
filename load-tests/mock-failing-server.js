/**
 * Mock Failing Server
 *
 * Simulates a webhook endpoint that fails intermittently.
 * Use this to test retry logic and exponential backoff.
 *
 * Run: node mock-failing-server.js
 */

const express = require('express');
const app = express();

app.use(express.json());

// Configuration
const PORT = 4000;
const FAIL_RATE = 0.3; // 30% of requests fail randomly
const FAILURE_MODES = {
  TIMEOUT: 'timeout',
  SERVER_ERROR: 'server_error',
  BAD_GATEWAY: 'bad_gateway',
  SERVICE_UNAVAILABLE: 'service_unavailable',
};

// Request counter
let requestCount = 0;

// Middleware to log all requests
app.use((req, res, next) => {
  requestCount++;
  console.log(`[${new Date().toISOString()}] Request #${requestCount}: ${req.method} ${req.path}`);
  next();
});

/**
 * Scenario 1: Always fail (test retry exhaustion)
 */
app.post('/always-fail', (req, res) => {
  console.log(`  ❌ ALWAYS FAIL: Returning 500`);
  res.status(500).json({ error: 'This endpoint always fails' });
});

/**
 * Scenario 2: Always succeed (baseline)
 */
app.post('/always-succeed', (req, res) => {
  console.log(`  ✅ ALWAYS SUCCEED: Returning 200`);
  res.status(200).json({
    success: true,
    message: 'Webhook received',
    timestamp: new Date().toISOString()
  });
});

/**
 * Scenario 3: Random failures
 */
app.post('/random-fail', (req, res) => {
  if (Math.random() < FAIL_RATE) {
    const errorCode = Math.random() < 0.5 ? 500 : 503;
    console.log(`  ❌ RANDOM FAIL: Returning ${errorCode}`);
    res.status(errorCode).json({ error: 'Random failure' });
  } else {
    console.log(`  ✅ RANDOM SUCCEED: Returning 200`);
    res.status(200).json({ success: true });
  }
});

/**
 * Scenario 4: Fail N times, then succeed (test retry success)
 */
const attemptCounts = new Map();

app.post('/fail-then-succeed/:attempts', (req, res) => {
  const requiredAttempts = parseInt(req.params.attempts) || 3;
  const eventId = req.headers['x-event-id'] || 'unknown';

  const currentAttempt = (attemptCounts.get(eventId) || 0) + 1;
  attemptCounts.set(eventId, currentAttempt);

  console.log(`  Event ${eventId}: Attempt ${currentAttempt}/${requiredAttempts}`);

  if (currentAttempt < requiredAttempts) {
    console.log(`  ❌ FAIL: Need ${requiredAttempts - currentAttempt} more attempts`);
    res.status(500).json({
      error: 'Not yet',
      attempt: currentAttempt,
      required: requiredAttempts
    });
  } else {
    console.log(`  ✅ SUCCESS: All attempts complete`);
    attemptCounts.delete(eventId); // Reset for next event
    res.status(200).json({
      success: true,
      attempts: currentAttempt
    });
  }
});

/**
 * Scenario 5: Timeout (test timeout handling)
 */
app.post('/timeout', (req, res) => {
  const delay = parseInt(req.query.delay) || 35000; // Default 35s (longer than 30s timeout)
  console.log(`  ⏱️  TIMEOUT: Delaying ${delay}ms`);

  setTimeout(() => {
    console.log(`  ✅ DELAYED RESPONSE`);
    res.status(200).json({ success: true, delayed: true });
  }, delay);
});

/**
 * Scenario 6: Slow response (test latency)
 */
app.post('/slow', (req, res) => {
  const delay = parseInt(req.query.delay) || 5000; // Default 5s
  console.log(`  🐌 SLOW: Delaying ${delay}ms`);

  setTimeout(() => {
    console.log(`  ✅ SLOW RESPONSE COMPLETE`);
    res.status(200).json({ success: true, delay });
  }, delay);
});

/**
 * Scenario 7: Connection drop (test network errors)
 */
app.post('/connection-drop', (req, res) => {
  console.log(`  💥 CONNECTION DROP: Destroying socket`);
  req.socket.destroy();
});

/**
 * Scenario 8: Incremental recovery (test circuit breaker patterns)
 */
let failureRate = 1.0; // Start at 100% failure

app.post('/recovery', (req, res) => {
  // Gradually reduce failure rate over time
  failureRate = Math.max(0, failureRate - 0.05);

  if (Math.random() < failureRate) {
    console.log(`  ❌ RECOVERING: Still failing (${(failureRate * 100).toFixed(0)}% failure rate)`);
    res.status(503).json({ error: 'Service recovering', failureRate });
  } else {
    console.log(`  ✅ RECOVERED: Success (${(failureRate * 100).toFixed(0)}% failure rate)`);
    res.status(200).json({ success: true, recoveryProgress: 1 - failureRate });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    requests: requestCount,
  });
});

/**
 * Status page
 */
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Mock Failing Server</title></head>
      <body>
        <h1>Mock Failing Server</h1>
        <p>Running on port ${PORT}</p>
        <p>Total requests: ${requestCount}</p>

        <h2>Available Endpoints:</h2>
        <ul>
          <li><code>POST /always-fail</code> - Always returns 500</li>
          <li><code>POST /always-succeed</code> - Always returns 200</li>
          <li><code>POST /random-fail</code> - Random failures (${(FAIL_RATE * 100)}%)</li>
          <li><code>POST /fail-then-succeed/N</code> - Fails N times, then succeeds</li>
          <li><code>POST /timeout?delay=35000</code> - Delays response (default 35s)</li>
          <li><code>POST /slow?delay=5000</code> - Slow response (default 5s)</li>
          <li><code>POST /connection-drop</code> - Drops connection immediately</li>
          <li><code>POST /recovery</code> - Gradually recovers from failure</li>
          <li><code>GET /health</code> - Health check</li>
        </ul>

        <h2>Usage:</h2>
        <ol>
          <li>Update webhook endpoint URL in database to point to this server</li>
          <li>Send webhooks through your API</li>
          <li>Watch retry behavior in worker logs</li>
        </ol>

        <h2>Example:</h2>
        <pre>
-- Update endpoint URL
UPDATE "WebhookEndpoint"
SET url = 'http://localhost:${PORT}/fail-then-succeed/3'
WHERE id = 'your-endpoint-id';

-- Send webhook
curl -X POST http://localhost:3000/webhooks/your-endpoint-id \\
  -H "X-Project-Key: your-key" \\
  -d '{"test": "data"}'

-- Watch worker logs for retry behavior
        </pre>
      </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Mock Failing Server running on http://localhost:${PORT}`);
  console.log(`\nAvailable test endpoints:`);
  console.log(`  POST http://localhost:${PORT}/always-fail`);
  console.log(`  POST http://localhost:${PORT}/always-succeed`);
  console.log(`  POST http://localhost:${PORT}/random-fail`);
  console.log(`  POST http://localhost:${PORT}/fail-then-succeed/3`);
  console.log(`  POST http://localhost:${PORT}/timeout?delay=35000`);
  console.log(`  POST http://localhost:${PORT}/slow?delay=5000`);
  console.log(`  POST http://localhost:${PORT}/connection-drop`);
  console.log(`  POST http://localhost:${PORT}/recovery`);
  console.log(`\nOpen http://localhost:${PORT} in your browser for more info\n`);
});
