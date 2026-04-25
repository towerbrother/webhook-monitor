/**
 * K6 Spike Test for Webhook Monitor
 *
 * Tests how the system handles sudden traffic spikes.
 *
 * Run: k6 run k6-spike-test.js
 */

import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },     // Normal load
    { duration: '10s', target: 500 },   // Spike! 50x increase
    { duration: '3m', target: 500 },    // Stay at spike
    { duration: '10s', target: 10 },    // Drop back to normal
    { duration: '1m', target: 10 },     // Recovery period
    { duration: '10s', target: 0 },     // Ramp down
  ],
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PROJECT_KEY = __ENV.PROJECT_KEY || 'your-project-key-here';
const ENDPOINT_ID = __ENV.ENDPOINT_ID || 'ep_test123';

export default function () {
  const response = http.post(
    `${BASE_URL}/webhooks/${ENDPOINT_ID}`,
    JSON.stringify({
      event: 'spike.test',
      vu: __VU,
      timestamp: Date.now(),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': PROJECT_KEY,
        'X-Idempotency-Key': `spike-${__VU}-${__ITER}-${Date.now()}`,
      },
    }
  );

  check(response, {
    'survived spike': (r) => r.status === 201,
    'latency acceptable during spike': (r) => r.timings.duration < 1000,
  });
}
