/**
 * K6 Load Test for Webhook Monitor API
 *
 * Tests API throughput and latency under increasing load.
 *
 * Run: k6 run k6-load-test.js
 *
 * Install k6:
 * - macOS: brew install k6
 * - Windows: choco install k6
 * - Linux: https://k6.io/docs/getting-started/installation/
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const webhookLatency = new Trend('webhook_latency');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Warm up: ramp to 10 users
    { duration: '1m', target: 10 },    // Steady: 10 users
    { duration: '30s', target: 50 },   // Ramp up: to 50 users
    { duration: '2m', target: 50 },    // Steady: 50 users
    { duration: '30s', target: 100 },  // Ramp up: to 100 users
    { duration: '2m', target: 100 },   // Steady: 100 users
    { duration: '30s', target: 200 },  // Spike: to 200 users
    { duration: '1m', target: 200 },   // Steady: 200 users
    { duration: '30s', target: 0 },    // Ramp down: to 0
  ],
  thresholds: {
    // API should respond in <200ms for 95% of requests
    http_req_duration: ['p(95)<200'],
    // Error rate should be below 1%
    errors: ['rate<0.01'],
    // 99th percentile should be <500ms
    webhook_latency: ['p(99)<500'],
  },
};

// Configuration (update these values)
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PROJECT_KEY = __ENV.PROJECT_KEY || 'your-project-key-here';
const ENDPOINT_ID = __ENV.ENDPOINT_ID || 'ep_test123';

export default function () {
  // Generate unique idempotency key for each request
  const idempotencyKey = `k6-${__VU}-${__ITER}-${Date.now()}`;

  const url = `${BASE_URL}/webhooks/${ENDPOINT_ID}`;
  const payload = JSON.stringify({
    event: 'load.test',
    timestamp: new Date().toISOString(),
    data: {
      userId: `user-${__VU}`,
      iteration: __ITER,
      random: Math.random(),
    },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Project-Key': PROJECT_KEY,
      'X-Idempotency-Key': idempotencyKey,
    },
  };

  // Make request and record timing
  const response = http.post(url, payload, params);

  // Track custom metrics
  webhookLatency.add(response.timings.duration);
  errorRate.add(response.status !== 201);

  // Validate response
  const success = check(response, {
    'status is 201': (r) => r.status === 201,
    'has eventId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.eventId !== undefined;
      } catch {
        return false;
      }
    },
    'response time < 200ms': (r) => r.timings.duration < 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!success) {
    console.error(`Request failed: ${response.status} ${response.body}`);
  }

  // Simulate realistic user behavior (think time between requests)
  sleep(1);
}

/**
 * Setup function - runs once at the start
 */
export function setup() {
  console.log('Starting load test...');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Project Key: ${PROJECT_KEY}`);
  console.log(`Endpoint ID: ${ENDPOINT_ID}`);
  console.log('---');
}

/**
 * Teardown function - runs once at the end
 */
export function teardown(data) {
  console.log('---');
  console.log('Load test complete!');
  console.log('Check the summary above for results.');
}
