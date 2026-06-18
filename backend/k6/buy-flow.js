// Teste de carga: simula clientes navegando e comprando, em requisições simultâneas.
// Modelo aberto (ramping-arrival-rate): mantém a MESMA taxa de req/s nos dois cenários
// (com e sem cache), tornando a comparação justa.
//
// Variáveis de ambiente:
//   BASE_URL  - URL da API (default http://localhost:3000; no docker use http://web:3000)
//   LABEL     - rótulo do run, vira o nome do arquivo de resultado (cache-on | cache-off)
//   RATE      - taxa-alvo de requisições por segundo no platô (default 80)
//   BUY_PROB  - probabilidade de uma jornada terminar em compra (default 0.25)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// timeout padrão por request: evita que um request travado bloqueie o teste
const REQ = { timeout: '15s' };

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LABEL    = __ENV.LABEL    || 'run';
const RATE     = parseInt(__ENV.RATE     || '80',   10);
const BUY_PROB = parseFloat(__ENV.BUY_PROB || '0.25');
const RAMP     = __ENV.RAMP    || '30s';   // duração de cada rampa
const PLATEAU  = __ENV.PLATEAU || '120s';  // duração do platô (use curto p/ demo ao vivo)

const browseCatalog  = new Trend('browse_catalog', true);
const viewProduct    = new Trend('view_product',   true);
const listOrders     = new Trend('list_orders',    true);
const checkoutDur    = new Trend('checkout',       true);
const checkoutCount  = new Counter('checkouts');
const checkoutErrors = new Rate('checkout_errors');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
  scenarios: {
    buy_flow: {
      executor:        'ramping-arrival-rate',
      timeUnit:        '1s',
      startRate:       5,
      preAllocatedVUs: 50,
      maxVUs:          200,
      stages: [
        { target: Math.min(20, RATE), duration: RAMP },
        { target: RATE, duration: RAMP    },
        { target: RATE, duration: PLATEAU },
        { target: 0,    duration: '5s'    },
      ],
    },
  },
};

export function setup() {
  const products  = http.get(`${BASE_URL}/products?page=1&pageSize=200`, REQ).json();
  const customers = http.get(`${BASE_URL}/customers?page=1&pageSize=200`, REQ).json();
  // API paginada retorna { data: [...] }; mantém compat. com resposta em array puro
  const productList  = Array.isArray(products)  ? products  : (products?.data  ?? []);
  const customerList = Array.isArray(customers) ? customers : (customers?.data ?? []);
  const productIds  = productList.map((p) => p.id);
  const customerIds = customerList.map((c) => c.id);
  if (productIds.length === 0 || customerIds.length === 0) {
    throw new Error('Setup falhou: rode `make seed` antes do teste.');
  }
  return { productIds, customerIds };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function thinkTime() {
  sleep(Math.random() * 0.4 + 0.2);
}

export default function (data) {
  const { productIds, customerIds } = data;

  // 1) Navegar catálogo
  let res = http.get(`${BASE_URL}/products`, { ...REQ, tags: { step: 'browse_catalog' } });
  check(res, { 'browse 200': (r) => r.status === 200 });
  browseCatalog.add(res.timings.duration);
  thinkTime();

  // 2) Ver 1–2 produtos
  const views = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < views; i++) {
    res = http.get(`${BASE_URL}/products/${pick(productIds)}`, { ...REQ, tags: { step: 'view_product' } });
    check(res, { 'view 200': (r) => r.status === 200 });
    viewProduct.add(res.timings.duration);
    thinkTime();
  }

  // 3) Ver lista de pedidos
  res = http.get(`${BASE_URL}/orders`, { ...REQ, tags: { step: 'list_orders' } });
  check(res, { 'orders 200': (r) => r.status === 200 });
  listOrders.add(res.timings.duration);
  thinkTime();

  // 4) Comprar (probabilístico)
  if (Math.random() < BUY_PROB) {
    const numItems = 1 + Math.floor(Math.random() * 3);
    const items = [];
    for (let i = 0; i < numItems; i++) {
      items.push({ product_id: pick(productIds), quantity: 1 + Math.floor(Math.random() * 3) });
    }
    const payload = JSON.stringify({
      customer_id: pick(customerIds),
      order_items_attributes: items,
    });
    res = http.post(`${BASE_URL}/orders`, payload, {
      ...REQ,
      headers: { 'Content-Type': 'application/json' },
      tags: { step: 'checkout' },
    });
    const ok = check(res, { 'checkout 201': (r) => r.status === 201 });
    checkoutDur.add(res.timings.duration);
    checkoutCount.add(1);
    checkoutErrors.add(!ok);
  }
}

export function handleSummary(data) {
  const d = data.metrics.http_req_duration.values;
  const reqs = data.metrics.http_reqs.values;
  const line =
    `\n[${LABEL}] reqs=${reqs.count} rps=${reqs.rate.toFixed(1)} ` +
    `med=${d.med.toFixed(1)}ms p95=${d['p(95)'].toFixed(1)}ms p99=${d['p(99)'].toFixed(1)}ms\n`;
  return {
    stdout: line,
    [`/results/summary-${LABEL}.json`]: JSON.stringify(data, null, 2),
  };
}
