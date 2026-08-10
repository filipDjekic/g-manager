import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const errorRate = new Rate('gmanager_load_errors')
const baseUrl = __ENV.BASE_URL || 'http://localhost:8080'
const mode = __ENV.MODE || 'smoke'

export const options = {
  scenarios: mode === 'load' ? {
    critical_flows: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.TARGET_RPS || 10),
      timeUnit: '1s',
      duration: __ENV.DURATION || '5m',
      preAllocatedVUs: Number(__ENV.PRE_ALLOCATED_VUS || 10),
      maxVUs: Number(__ENV.MAX_VUS || 30),
    },
  } : {
    smoke: { executor: 'per-vu-iterations', vus: 1, iterations: 1 },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    gmanager_load_errors: ['rate<0.01'],
  },
}

function login(email, password) {
  const response = http.post(`${baseUrl}/api/v1/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { flow: 'auth' },
  })
  const ok = check(response, { 'login succeeds': (result) => result.status === 200 })
  errorRate.add(!ok)
  return ok ? response.json('token') : null
}

function authorized(token, extra = {}, flow = 'read') {
  return { headers: { Authorization: `Bearer ${token}`, ...extra }, tags: { flow } }
}

export default function () {
  const customerToken = login(__ENV.CUSTOMER_EMAIL, __ENV.CUSTOMER_PASSWORD)
  const managerToken = login(__ENV.MANAGER_EMAIL, __ENV.MANAGER_PASSWORD)
  if (!customerToken || !managerToken) return

  const requests = [
    http.get(`${baseUrl}/api/v1/orders/me?page=0&size=20`, authorized(customerToken, {}, 'list')),
    http.get(`${baseUrl}/api/v1/reservations/me?page=0&size=20`, authorized(customerToken, {}, 'list')),
    http.get(`${baseUrl}/api/v1/dashboard/today`, authorized(managerToken, {}, 'dashboard')),
  ]
  requests.forEach((response) => errorRate.add(!check(response, {
    'read endpoint succeeds': (result) => result.status === 200,
  })))

  if (__ENV.PRODUCT_ID) {
    const response = http.post(`${baseUrl}/api/v1/orders`, JSON.stringify({
      items: [{ productId: __ENV.PRODUCT_ID, quantity: 1 }],
    }), authorized(customerToken, {
      'Content-Type': 'application/json',
      'Idempotency-Key': `k6-${__VU}-${__ITER}`,
    }, 'create'))
    errorRate.add(!check(response, { 'order creation succeeds': (result) => result.status === 201 }))
  }
  sleep(1)
}
