/**
 * K6 Stress Test for Webhook Monitor
 *
 * Finds the breaking point of the system by gradually increasing load.
 *
 * Run: k6 run k6-stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const successCounter = new Counter('successful_requests');
const failureCounter = new Counter('failed_requests');

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '2m', target: 200 },   // Ramp up to 200 users
    { duration: '2m', target: 300 },   // Ramp up to 300 users
    { duration: '2m', target: 400 },   // Ramp up to 400 users
    { duration: '2m', target: 500 },   // Ramp up to 500 users
    { duration: '5m', target: 500 },   // Hold at 500 users
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    // Allow higher error rates for stress testing
    http_req_failed: ['rate<0.1'],  // Less than 10% failures
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PROJECT_KEY = __ENV.PROJECT_KEY || 'your-project-key-here';
const ENDPOINT_ID = __ENV.ENDPOINT_ID || 'ep_test123';

export default function () {
  const idempotencyKey = `stress-${__VU}-${__ITER}-${Date.now()}`;

  const response = http.post(
    `${BASE_URL}/webhooks/${ENDPOINT_ID}`,
    JSON.stringify({
      event: 'stress.test',
      timestamp: new Date().toISOString(),
      vu: __VU,
      iteration: __ITER,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': PROJECT_KEY,
        'X-Idempotency-Key': idempotencyKey,
      },
    }
  );

  if (response.status === 201) {
    successCounter.add(1);
  } else {
    failureCounter.add(1);
    console.error(`VU ${__VU} failed: ${response.status} - ${response.body}`);
  }

  check(response, {
    'status is 201': (r) => r.status === 201,
  });

  // Minimal sleep to maximize load
  sleep(0.1);
}

export function handleSummary(data) {
  const successRate = (data.metrics.successful_requests.values.count /
    (data.metrics.successful_requests.values.count + data.metrics.failed_requests.values.count) * 100).toFixed(2);

  console.log('\n=== STRESS TEST RESULTS ===');
  console.log(`Max VUs reached: ${data.metrics.vus_max.values.max}`);
  console.log(`Total requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`Success rate: ${successRate}%`);
  console.log(`P95 latency: ${data.metrics.http_req_duration.values['p(95)']}ms`);
  console.log(`P99 latency: ${data.metrics.http_req_duration.values['p(99)']}ms`);
  console.log('===========================\n');

  return {
    'stress-test-summary.json': JSON.stringify(data, null, 2),
  };
}
