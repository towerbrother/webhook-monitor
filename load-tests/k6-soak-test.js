/**
 * K6 Soak Test for Webhook Monitor
 *
 * Tests system stability over extended periods (checks for memory leaks, etc.)
 *
 * Run: k6 run k6-soak-test.js
 *
 * WARNING: This test runs for 2+ hours
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5m', target: 50 },    // Ramp up
    { duration: '2h', target: 50 },    // Soak at 50 users for 2 hours
    { duration: '5m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],  // 95% under 300ms throughout
    http_req_failed: ['rate<0.01'],    // Less than 1% errors
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PROJECT_KEY = __ENV.PROJECT_KEY || 'your-project-key-here';
const ENDPOINT_ID = __ENV.ENDPOINT_ID || 'ep_test123';

export default function () {
  const response = http.post(
    `${BASE_URL}/webhooks/${ENDPOINT_ID}`,
    JSON.stringify({
      event: 'soak.test',
      timestamp: new Date().toISOString(),
      vu: __VU,
      iteration: __ITER,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': PROJECT_KEY,
        'X-Idempotency-Key': `soak-${__VU}-${__ITER}-${Date.now()}`,
      },
    }
  );

  check(response, {
    'no degradation over time': (r) => r.status === 201 && r.timings.duration < 300,
  });

  sleep(2);  // 2 second think time
}

export function handleSummary(data) {
  console.log('\n=== SOAK TEST COMPLETE ===');
  console.log(`Duration: ${(data.state.testRunDurationMs / 1000 / 60).toFixed(0)} minutes`);
  console.log(`Total requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`Avg latency: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`P95 latency: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`Error rate: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  console.log('===========================\n');

  return {
    'soak-test-results.json': JSON.stringify(data, null, 2),
  };
}
