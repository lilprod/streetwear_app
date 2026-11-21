/* global open, __ENV */
// k6 : charge serveur sur l'API compilée. Objectif du cahier des charges : 95 % des requêtes < 500 ms à 50 req/s.
// SCENARIO=public  : mélange routes publiques (catalogue, zone, créneaux) à RATE req/s pendant DURATION
// SCENARIO=orders  : création de commande (POST /orders, une commande par client préparé par prepare.mjs) à RATE req/s
// Variables : BASE (défaut http://localhost:3100/v1), RATE (50), DURATION (60s), SCENARIO.
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

const fx = JSON.parse(open('../results/logs/perf-fixtures.json'));
const BASE = __ENV.BASE || 'http://localhost:3100/v1';
const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '60s';
const SCENARIO = __ENV.SCENARIO || 'public';

export const options = {
  scenarios: {
    load: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 100,
      maxVUs: 400,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    ...Object.fromEntries(
      [
        'catalog_patterns',
        'catalog_colors',
        'catalog_categories',
        'catalog_pricing',
        'catalog_availability',
        'zone_resolve',
        'stores',
        'slots',
        'orders_create',
      ].map((n) => [`http_req_duration{name:${n}}`, ['p(95)<500']]),
    ),
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const PUBLIC = [
  ['catalog_patterns', '/catalog/patterns'],
  ['catalog_colors', '/catalog/colors'],
  ['catalog_categories', '/catalog/categories'],
  ['catalog_pricing', '/catalog/pricing'],
  ['catalog_availability', '/catalog/availability?colorId=col-noir'],
  ['zone_resolve', '/delivery/zones/resolve?lat=6.1319&lng=1.2228'],
  ['stores', '/stores'],
  ['slots', `/stores/${fx.storeId}/slots?date=${fx.slotDate}`],
];

export default function () {
  if (SCENARIO === 'orders') {
    const i = exec.scenario.iterationInTest % fx.tokens.length;
    const res = http.post(
      `${BASE}/orders`,
      JSON.stringify({
        reception: { type: 'pickup', storeId: fx.storeId, slotId: fx.slotId },
        paymentMethod: 'tmoney',
      }),
      {
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${fx.tokens[i]}`,
          'idempotency-key': uuidv4(),
        },
        tags: { name: 'orders_create' },
      },
    );
    check(res, { 'commande créée (201)': (r) => r.status === 201 });
    return;
  }
  const [name, path] = PUBLIC[Math.floor(Math.random() * PUBLIC.length)];
  const res = http.get(`${BASE}${path}`, { tags: { name } });
  check(res, { 200: (r) => r.status === 200 });
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
