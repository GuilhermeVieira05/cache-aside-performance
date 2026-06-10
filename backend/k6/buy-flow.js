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
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LABEL = __ENV.LABEL || 'run';
const RATE = parseInt(__ENV.RATE || '80', 10);
const BUY_PROB = parseFloat(__ENV.BUY_PROB || '0.25');

// Métricas customizadas por etapa da jornada (isTime=true para formatar como duração).
const browseCatalog = new Trend('browse_catalog', true);
const viewProduct = new Trend('view_product', true);
const listOrders = new Trend('list_orders', true);
const checkoutDur = new Trend('checkout', true);
const checkoutCount = new Counter('checkouts');
const checkoutErrors = new Rate('checkout_errors');

export const options = {
  // Percentis exibidos no summary (inclui p99 para análise de cauda).
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    // Informativos: não abortam o run, apenas marcam pass/fail no summary.
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
  scenarios: {
    buy_flow: {
      executor: 'ramping-arrival-rate',
      timeUnit: '1s',
      startRate: 5,
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { target: 20, duration: '30s' }, // warm-up: aquece o cache no run com cache
        { target: RATE, duration: '30s' }, // sobe até a taxa-alvo
        { target: RATE, duration: '120s' }, // platô: janela principal de medição
        { target: 0, duration: '10s' }, // ramp-down
      ],
    },
  },
};

// Executa uma vez antes do teste: descobre IDs válidos via API (robusto a re-seed).
export function setup() {
  const products = http.get(`${BASE_URL}/products`).json() || [];
  const customers = http.get(`${BASE_URL}/customers`).json() || [];
  const productIds = products.map((p) => p.id);
  const customerIds = customers.map((c) => c.id);
  if (productIds.length === 0 || customerIds.length === 0) {
    throw new Error('Setup falhou: rode `rails db:seed` antes do teste (sem produtos/clientes).');
  }
  return { productIds, customerIds };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function thinkTime() {
  sleep(Math.random() * 0.4 + 0.2); // 0.2s–0.6s entre passos
}

// Uma iteração = uma jornada de cliente.
export default function (data) {
  const { productIds, customerIds } = data;

  // 1) Navegar o catálogo (GET /products → cache products:all)
  let res = http.get(`${BASE_URL}/products`, { tags: { step: 'browse_catalog' } });
  check(res, { 'browse 200': (r) => r.status === 200 });
  browseCatalog.add(res.timings.duration);
  thinkTime();

  // 2) Ver 1–2 produtos (GET /products/:id → cache products:{id})
  const views = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < views; i++) {
    res = http.get(`${BASE_URL}/products/${pick(productIds)}`, { tags: { step: 'view_product' } });
    check(res, { 'view 200': (r) => r.status === 200 });
    viewProduct.add(res.timings.duration);
    thinkTime();
  }

  // 3) Ver lista de pedidos (GET /orders → cache orders:all, índice com JOINs, caro sem cache)
  res = http.get(`${BASE_URL}/orders`, { tags: { step: 'list_orders' } });
  check(res, { 'orders 200': (r) => r.status === 200 });
  listOrders.add(res.timings.duration);
  thinkTime();

  // 4) Comprar (probabilístico) — POST /orders invalida orders:all
  if (Math.random() < BUY_PROB) {
    const numItems = 1 + Math.floor(Math.random() * 3);
    const items = [];
    for (let i = 0; i < numItems; i++) {
      items.push({ product_id: pick(productIds), quantity: 1 + Math.floor(Math.random() * 3) });
    }
    const payload = JSON.stringify({
      order: {
        customer_id: pick(customerIds),
        status: 'pending',
        order_items_attributes: items,
      },
    });
    res = http.post(`${BASE_URL}/orders`, payload, {
      headers: { 'Content-Type': 'application/json' },
      tags: { step: 'checkout' },
    });
    const ok = check(res, { 'checkout 201': (r) => r.status === 201 });
    checkoutDur.add(res.timings.duration);
    checkoutCount.add(1);
    checkoutErrors.add(!ok);
  }
}

// Grava o summary agregado em JSON (consumido pela interface) + imprime no terminal.
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`/results/summary-${LABEL}.json`]: JSON.stringify(data, null, 2),
  };
}
