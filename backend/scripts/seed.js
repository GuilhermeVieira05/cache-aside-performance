#!/usr/bin/env node
'use strict';

const { Client } = require('pg');

// ---------------------------------------------------------------------------
// Data pools (same as Rails seed)
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Ana','Bruno','Carlos','Daniela','Eduardo','Fernanda','Gabriel','Helena','Igor','Julia',
  'Kaio','Laura','Marcos','Natalia','Otavio','Paula','Rafael','Sandra','Thiago','Ursula',
  'Victor','Wendy','Xavier','Yasmin','Zeca','Beatriz','Cintia','Diego','Elisa','Felipe',
  'Giovanna','Hugo','Ingrid','Joao','Karen','Leandro','Mariana','Nicolas','Olivia','Pedro',
];

const LAST_NAMES = [
  'Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Ferreira','Rodrigues','Almeida',
  'Nascimento','Carvalho','Dias','Martins','Fernandes','Goncalves','Ribeiro','Araujo','Melo',
  'Barbosa','Rocha','Cavalcanti','Monteiro','Moura','Nogueira','Vieira','Rezende','Azevedo',
];

const CITIES = [
  'São Paulo, SP','Rio de Janeiro, RJ','Belo Horizonte, MG','Curitiba, PR','Porto Alegre, RS',
  'Salvador, BA','Fortaleza, CE','Manaus, AM','Recife, PE','Brasília, DF',
];

const STREETS = [
  'das Flores','dos Pinheiros','da Liberdade','do Sol','das Rosas',
  'do Carmo','das Palmeiras','do Bosque','da Paz','dos Ipês',
];

const CATEGORIES  = ['Eletrônicos','Roupas','Casa','Livros','Alimentos','Esportes','Beleza','Brinquedos','Jardim','Automotivo'];
const ADJECTIVES  = ['Premium','Classic','Ultra','Lite','Pro','Advanced','Deluxe','Essential','Smart','Basic','Turbo','Max','Super'];
const NOUNS       = ['Widget','Gadget','Device','Tool','Kit','Bundle','Pack','Set','Combo','Unit','Module','Item','Product'];
const STATUSES    = [0, 1, 2, 3, 4]; // pending..cancelled

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick(arr, i) { return arr[i % arr.length]; }

function buildInsert(table, rows) {
  if (rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  const vals = rows.map((row, ri) =>
    '(' + cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',') + ')'
  ).join(',');
  const flat = rows.flatMap(row => cols.map(c => row[c]));
  return { text: `INSERT INTO ${table} (${cols.join(',')}) VALUES ${vals}`, values: flat };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('Limpando banco de dados...');
  await client.query('DELETE FROM order_items');
  await client.query('DELETE FROM orders');
  await client.query('DELETE FROM products');
  await client.query('DELETE FROM customers');

  const now = new Date();

  // ── Customers (100) ──────────────────────────────────────────────────────
  console.log('Criando 100 clientes...');
  const customersData = Array.from({ length: 100 }, (_, i) => ({
    name:       `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i)}`,
    email:      `${pick(FIRST_NAMES, i).toLowerCase()}.${pick(LAST_NAMES, i).toLowerCase()}${i + 1}@exemplo.com`,
    phone:      `(${10 + (i % 89)}) 9${(1000 + i * 7) % 9000 + 1000}-${(2000 + i * 13) % 9000 + 1000}`,
    address:    `Rua ${pick(STREETS, i)}, ${(i * 7 + 1) % 999 + 1} - ${pick(CITIES, i)}`,
    created_at: now,
    updated_at: now,
  }));

  const custQ = buildInsert('customers', customersData);
  await client.query(custQ.text + ' RETURNING id', custQ.values);

  const { rows: custRows } = await client.query('SELECT id FROM customers ORDER BY id');
  const customerIds = custRows.map(r => r.id);
  console.log(`  -> ${customerIds.length} clientes criados`);

  // ── Products (1000) ──────────────────────────────────────────────────────
  console.log('Criando 1000 produtos...');
  const BATCH = 250;
  for (let b = 0; b < 4; b++) {
    const rows = Array.from({ length: BATCH }, (_, j) => {
      const i = b * BATCH + j;
      return {
        name:           `${pick(ADJECTIVES, i)} ${pick(NOUNS, i)} ${i + 1}`,
        description:    `Produto de alta qualidade, categoria ${pick(CATEGORIES, i)}, item nº ${i + 1}.`,
        price:          (((i * 37 + 100) % 99900 + 100) / 100).toFixed(2),
        stock_quantity: (i * 13 + 10) % 491,
        category:       pick(CATEGORIES, i),
        created_at:     now,
        updated_at:     now,
      };
    });
    const q = buildInsert('products', rows);
    await client.query(q.text, q.values);
  }

  const { rows: prodRows } = await client.query('SELECT id, price FROM products ORDER BY id');
  const productIds    = prodRows.map(r => r.id);
  const productPrices = Object.fromEntries(prodRows.map(r => [r.id, parseFloat(r.price)]));
  console.log(`  -> ${productIds.length} produtos criados`);

  // ── Orders (20 000) ──────────────────────────────────────────────────────
  console.log('Criando 20000 pedidos (lotes de 1000)...');
  const TOTAL_ORDERS = 20_000;
  const ORDER_BATCH  = 1_000;

  for (let b = 0; b < TOTAL_ORDERS / ORDER_BATCH; b++) {
    const rows = Array.from({ length: ORDER_BATCH }, (_, j) => {
      const i = b * ORDER_BATCH + j;
      return {
        customer_id: customerIds[i % customerIds.length],
        status:      STATUSES[i % STATUSES.length],
        total_price: '0.00',
        created_at:  now,
        updated_at:  now,
      };
    });
    const q = buildInsert('orders', rows);
    await client.query(q.text, q.values);
    process.stdout.write(`  lote ${b + 1}/${TOTAL_ORDERS / ORDER_BATCH}\r`);
  }
  console.log('');

  const { rows: orderRows } = await client.query('SELECT id FROM orders ORDER BY id');
  const orderIds = orderRows.map(r => r.id);
  console.log(`  -> ${orderIds.length} pedidos criados`);

  // ── OrderItems + totals ───────────────────────────────────────────────────
  console.log('Criando itens e calculando totais...');
  const SLICE = 2_000;
  const totalSlices = Math.ceil(orderIds.length / SLICE);

  for (let s = 0; s < totalSlices; s++) {
    const slice   = orderIds.slice(s * SLICE, (s + 1) * SLICE);
    const items   = [];
    const totals  = {};

    slice.forEach((orderId, j) => {
      const idx       = s * SLICE + j;
      const numItems  = idx % 4 + 1;
      let   orderTotal = 0;

      for (let k = 0; k < numItems; k++) {
        const pid   = productIds[(idx * 7 + k * 13) % productIds.length];
        const price = productPrices[pid];
        const qty   = (s + j + k) % 5 + 1;
        orderTotal += price * qty;
        items.push({
          order_id:   orderId,
          product_id: pid,
          quantity:   qty,
          unit_price: price.toFixed(2),
          created_at: now,
          updated_at: now,
        });
      }
      totals[orderId] = orderTotal.toFixed(2);
    });

    // Batch insert items (max ~250 rows at a time to stay under param limit)
    const ITEM_BATCH = 250;
    for (let i = 0; i < items.length; i += ITEM_BATCH) {
      const batch = items.slice(i, i + ITEM_BATCH);
      const q = buildInsert('order_items', batch);
      await client.query(q.text, q.values);
    }

    // Bulk update totals with a CASE statement
    const orderIdList = Object.keys(totals);
    const caseExpr    = orderIdList.map((id, i) => `WHEN $${i * 2 + 1}::bigint THEN $${i * 2 + 2}::numeric`).join(' ');
    const caseVals    = orderIdList.flatMap(id => [id, totals[id]]);
    const placeholders = orderIdList.map((_, i) => `$${i * 2 + 1}::bigint`).join(',');

    await client.query(
      `UPDATE orders SET total_price = CASE id ${caseExpr} END WHERE id IN (${placeholders})`,
      caseVals,
    );

    process.stdout.write(`  slice ${s + 1}/${totalSlices}\r`);
  }

  console.log('');

  const { rows: summary } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM customers)  AS customers,
      (SELECT COUNT(*) FROM products)   AS products,
      (SELECT COUNT(*) FROM orders)     AS orders,
      (SELECT COUNT(*) FROM order_items) AS order_items
  `);

  const s = summary[0];
  console.log('Seed concluído!');
  console.log(`  Clientes:  ${s.customers}`);
  console.log(`  Produtos:  ${s.products}`);
  console.log(`  Pedidos:   ${s.orders}`);
  console.log(`  Itens:     ${s.order_items}`);

  await client.end();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
