// Micro-benchmark do cache-aside: mede a latência (ms) de cada caminho num
// request por vez, sem concorrência, reusando a conexão (keep-alive).
// Cenários: SQL direto (cache OFF) · MISS · HIT · invalidação (PUT).
// Gera as métricas usadas na slide "O preço do MISS".
//
// Pré-requisitos: stack no ar (`make start`) e seed aplicado (`make seed`).
// Uso: node scripts/micro-benchmark.mjs
// Restaura o cache para o estado inicial (desligado) ao final.
import http from 'node:http';

const HOST = 'localhost';
const PORT = 3000;
const PID = process.env.PID || '3031'; // id de um produto existente (ajuste se necessário)
const LIST = '/products?page=1&pageSize=200';
const N = 150;      // amostras medidas
const WARMUP = 20;  // descartadas

const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = data.length;
    }
    const t0 = process.hrtime.bigint();
    const r = http.request({ host: HOST, port: PORT, path, method, headers, agent }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        resolve({ ms, code: res.statusCode, xcache: res.headers['x-cache'] });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function status() {
  const r = await fetch(`http://${HOST}:${PORT}/cache/status`);
  return (await r.json()).enabled;
}
async function setCache(enabled) {
  if ((await status()) !== enabled) {
    await fetch(`http://${HOST}:${PORT}/cache/toggle`, { method: 'POST' });
  }
  if ((await status()) !== enabled) throw new Error('falha ao ajustar cache');
}

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  const cut = Math.floor(s.length * 0.1);
  const trimmed = s.slice(cut, s.length - cut);
  const tavg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length; // média aparada 10%
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, avg, tavg, med: q(0.5), p95: q(0.95), min: s[0], max: s[s.length - 1] };
}
const f = (v) => v.toFixed(2);
function line(label, st, expect) {
  console.log(
    `${label.padEnd(26)} med ${f(st.med).padStart(7)}  trim ${f(st.tavg).padStart(7)}  avg ${f(st.avg).padStart(7)}  ` +
    `p95 ${f(st.p95).padStart(7)}  min ${f(st.min).padStart(7)}  max ${f(st.max).padStart(7)}  (${expect})`,
  );
}

async function run() {
  // ---------- 1) SQL DIRETO (cache OFF) ----------
  await setCache(false);
  for (let i = 0; i < WARMUP; i++) await req('GET', LIST);
  const sql = [];
  let badSql = 0;
  for (let i = 0; i < N; i++) {
    const r = await req('GET', LIST);
    if (r.xcache !== 'DISABLED') badSql++;
    sql.push(r.ms);
  }

  // ---------- liga o cache ----------
  await setCache(true);
  for (let i = 0; i < WARMUP; i++) { await req('PUT', `/products/${PID}`, { product: { stock_quantity: 10 } }); await req('GET', LIST); }

  // ---------- 2) MISS + 4) INVALIDAÇÃO (PUT) ----------
  const miss = [], inval = [];
  let badMiss = 0;
  for (let i = 0; i < N; i++) {
    const p = await req('PUT', `/products/${PID}`, { product: { stock_quantity: 10 + (i % 5) } });
    inval.push(p.ms);
    const g = await req('GET', LIST);
    if (g.xcache !== 'MISS') badMiss++;
    miss.push(g.ms);
  }

  // ---------- 3) HIT ----------
  await req('GET', LIST); // garante populado (MISS)
  for (let i = 0; i < WARMUP; i++) await req('GET', LIST);
  const hit = [];
  let badHit = 0;
  for (let i = 0; i < N; i++) {
    const r = await req('GET', LIST);
    if (r.xcache !== 'HIT') badHit++;
    hit.push(r.ms);
  }

  const Ssql = stats(sql), Smiss = stats(miss), Shit = stats(hit), Sinv = stats(inval);
  console.log(`\n=== ${N} amostras por cenário (ms, keep-alive) ===\n`);
  line('SQL direto (cache OFF)', Ssql, `DISABLED, ${N - badSql}/${N} ok`);
  line('Cache MISS (1a req)', Smiss, `MISS, ${N - badMiss}/${N} ok`);
  line('Cache HIT (2a+ req)', Shit, `HIT, ${N - badHit}/${N} ok`);
  line('Invalidacao (PUT)', Sinv, `WRITE`);

  // ---------- break-even ----------
  console.log('\n=== custo acumulado de N leituras da MESMA listagem ===');
  console.log('N  | sem cache (N x SQL) | com cache (MISS + (N-1) x HIT) | vencedor');
  for (const n of [1, 2, 3, 5, 10]) {
    const semCache = n * Ssql.med;
    const comCache = Smiss.med + (n - 1) * Shit.med;
    const win = comCache < semCache ? 'CACHE' : 'sem cache';
    console.log(`${String(n).padStart(2)} | ${f(semCache).padStart(8)} ms        | ${f(comCache).padStart(8)} ms                  | ${win}`);
  }

  // JSON para colar no slide
  const round = (s) => ({ avg: +s.avg.toFixed(2), med: +s.med.toFixed(2), p95: +s.p95.toFixed(2), min: +s.min.toFixed(2), max: +s.max.toFixed(2) });
  console.log('\nJSON:', JSON.stringify({ sql: round(Ssql), miss: round(Smiss), hit: round(Shit), inval: round(Sinv) }));

  await setCache(false); // restaura estado original
}
run().catch((e) => { console.error(e); process.exit(1); });
