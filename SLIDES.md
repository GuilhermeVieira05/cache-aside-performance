---
marp: true
theme: default
paginate: true
html: true
style: |
  /* ── Base ──────────────────────────────────────────── */
  section {
    background: #ffffff;
    color: #374151;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 20px;
    padding: 42px 55px;
  }
  /* ── Headings ──────────────────────────────────────── */
  h1 {
    font-size: 30px;
    color: #1e3a5f;
    border-bottom: 3px solid #1e3a5f;
    padding-bottom: 8px;
    margin-top: 0;
    margin-bottom: 16px;
  }
  h2 {
    font-size: 25px;
    color: #1e3a5f;
    margin-top: 0;
    margin-bottom: 14px;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 6px;
  }
  h3 { font-size: 18px; color: #1e3a5f; margin: 10px 0 6px; }
  /* ── Lists ─────────────────────────────────────────── */
  ul li { margin-bottom: 5px; color: #374151; }
  /* ── Code blocks ───────────────────────────────────── */
  pre {
    font-size: 12px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-left: 4px solid #1e3a5f;
    border-radius: 4px;
    padding: 12px 16px;
    color: #1f2937;
    margin: 10px 0;
  }
  code {
    font-size: 12px;
    background: #e5e7eb;
    color: #1e3a5f;
    padding: 1px 5px;
    border-radius: 3px;
  }
  pre code { background: transparent; color: #1f2937; padding: 0; }
  /* ── Tables ────────────────────────────────────────── */
  table {
    font-size: 16px;
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0;
  }
  th {
    background: #1e3a5f;
    color: #ffffff;
    padding: 7px 11px;
    border: 1px solid #1e3a5f;
    font-weight: 600;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: .5px;
  }
  td {
    padding: 6px 11px;
    border: 1px solid #e5e7eb;
    color: #374151;
  }
  tr:nth-child(even) td { background: #f9fafb; }
  /* ── Blockquote ─────────────────────────────────────── */
  blockquote {
    border-left: 4px solid #1e3a5f;
    background: #f0f4f8;
    padding: 8px 14px;
    color: #6b7280;
    font-style: italic;
    margin: 12px 0 0;
    border-radius: 0 4px 4px 0;
  }
  /* ── Strong / em ────────────────────────────────────── */
  strong { color: #1e3a5f; }
  /* ── Pagination ─────────────────────────────────────── */
  section::after { color: #9ca3af; font-size: 14px; }
  /* ── Cover slide ─────────────────────────────────────── */
  section.title {
    background: #1e3a5f;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
  }
  section.title h1 {
    font-size: 40px;
    color: #ffffff;
    border-color: #ffffff;
    margin-bottom: 10px;
  }
  section.title h3 { color: #93b8d8; font-size: 20px; font-weight: 400; }
  section.title .tagline {
    margin-top: 28px;
    font-size: 15px;
    color: #93b8d8;
    border-top: 1px solid #2d5986;
    padding-top: 14px;
  }
  /* ── Badges (usados em conclusão) ────────────────────── */
  .badge-ok {
    display: inline-block;
    background: #d1fae5;
    color: #065f46;
    border-radius: 12px;
    padding: 2px 10px;
    font-size: 13px;
    font-weight: 700;
  }
  .badge-metric {
    display: inline-block;
    background: #dbeafe;
    color: #1e40af;
    border-radius: 12px;
    padding: 2px 10px;
    font-size: 13px;
    font-weight: 700;
  }
---

<!-- _class: title -->

# Cache Aside e Performance de APIs

### Arquitetura de Software — 5º período | PUC Minas

<div class="tagline">Rails 7.2 · PostgreSQL 16 · Redis 7 · Docker Compose · k6 · Grafana</div>

---

## Slide 1 — Problema

**Contexto:** API acadêmica com consultas repetitivas que sobrecarregam o banco.

- Toda requisição de leitura vai ao PostgreSQL — sem atalho
- Dados de catálogo (produtos, clientes, pedidos) mudam pouco, mas são lidos com alta frequência
- Sob carga, o banco vira gargalo: **latência dispara, throughput cai**

**Solução proposta:** padrão **Cache Aside** com Redis como camada intermediária

---

## Slide 2 — O Padrão Cache Aside

```
LEITURA
  1. Consulta o Redis
     → HIT:  retorna direto  (banco não é tocado)
     → MISS: consulta o banco → grava no Redis → retorna

ESCRITA (create / update / delete)
  1. Persiste no banco
  2. Invalida a chave no Redis (apaga)
  → próxima leitura vai ao banco e renova o cache
```

**Por que invalidar em vez de atualizar o cache?**
Invalidar é mais simples e elimina a janela de cache inconsistente — sem precisar
garantir atomicidade na re-serialização do objeto.

---

## Slide 3 — Arquitetura da Solução

```
Cliente HTTP
    │
    ▼
Rails 7.2 (API-only)
    ├── CacheService.fetch(key) { ... }
    │       ├── [HIT]  Redis  ← resposta em memória, banco não tocado
    │       └── [MISS] PostgreSQL → grava no Redis → resposta
    │
    ├── CacheService.invalidate(*keys)
    │       └── apaga chaves após create / update / delete
    │
    └── CacheStats  →  GET /stats  →  hits · misses · invalidations

Observabilidade
    Rails logs → Promtail → Loki → Grafana (:3001)
    Relatório k6             →  http://localhost:8080/report/
```

**Toggle:** variável de ambiente `CACHE_ENABLED=true|false` — mesma imagem, dois cenários

---

## Slide 4 — Metodologia dos Testes

**Ferramenta:** k6 — 200 usuários virtuais simultâneos · 40 req/s · ~220 s de duração

| Etapa    | Requisição          | Detalhe                              |
|----------|---------------------|--------------------------------------|
| Catálogo | `GET /products`     | Lista todos os produtos              |
| Produto  | `GET /products/:id` | Detalha 1–2 produtos                 |
| Pedidos  | `GET /orders`       | JOIN pesado (pedidos + itens)        |
| Compra   | `POST /orders` (25%)| Cria pedido → **invalida cache**     |

**Dataset:** 300 clientes · 500 produtos · 2.000 pedidos — mesma seed nos dois cenários

**Dois cenários isolados:**
- `cache-off` → `CACHE_ENABLED=false` — toda requisição vai ao banco
- `cache-on`  → `CACHE_ENABLED=true`  — padrão cache-aside ativo · Redis zerado antes do run

---

## Slide 5 — Resultados: Latência

| Métrica           | Sem cache  | Com cache  | Redução    |
|-------------------|:----------:|:----------:|:----------:|
| **Latência média**| 12.379 ms  | 5.471 ms   | **55,8% ↓**|
| **Latência p90**  | 16.686 ms  | 7.461 ms   | **55,3% ↓**|
| **Latência p95**  | 17.290 ms  | 7.713 ms   | **55,4% ↓**|
| **Latência p99**  | 17.889 ms  | 8.170 ms   | **54,3% ↓**|
| **Latência máx.** | 18.786 ms  | 9.010 ms   | **52,0% ↓**|

> O cache reduziu **~55% o tempo de resposta** em todos os percentis,
> sob carga de 200 usuários simultâneos.

---

## Slide 6 — Resultados: Throughput

| Métrica                  | Sem cache | Com cache | Variação      |
|--------------------------|:---------:|:---------:|:-------------:|
| **Requisições totais**   | 2.982     | 6.044     | **+102,7% ↑** |
| **Throughput (req/s)**   | 13,54     | 28,14     | **+107,8% ↑** |
| **Iterações concluídas** | 728       | 1.617     | **+122,1% ↑** |
| **Iterações dropadas**   | 5.450     | 4.657     | **14,5% ↓**   |

> Com cache, o servidor entregou **mais que o dobro de requisições** no mesmo tempo
> e completou **2,2× mais jornadas** de cliente.

---

## Slide 7 — Cache Hit, Miss e Invalidação

Medido durante o cenário `cache-on` com 200 usuários virtuais:

| Contador         | Valor     |
|------------------|:---------:|
| **Cache HITs**   | 420       |
| **Cache MISSes** | 291       |
| **Hit Rate**     | **59,1%** |
| **Invalidações** | 49        |

**Consultas ao banco:**

| Cenário      | Consultas | Diferença   |
|--------------|:---------:|:-----------:|
| Sem cache    | 1.422     | base        |
| **Com cache**| **804**   | **43,5% ↓** |

> As 49 invalidações correspondem às compras (`POST /orders`) — cada compra apaga
> `orders:all` e renova o cache na próxima leitura.

---

## Slide 8 — Trade-offs Arquiteturais

| Dimensão          | Sem cache                      | Com cache                         |
|-------------------|--------------------------------|-----------------------------------|
| **Latência**      | Alta — banco toda vez          | Baixa nos HITs (~55% menos)       |
| **Throughput**    | Limitado pelo banco            | ~2× maior                         |
| **Consistência**  | Forte                          | Eventual (janela mínima: 1 req)   |
| **Complexidade**  | Simples                        | Maior — invalidação + TTL         |
| **Resiliência**   | Ponto único: banco             | Redis offline → fallback ao banco |

**Estratégia de consistência — `invalidate-on-write`:**
Escrita → banco persistido → chave **apagada** (não atualizada) → próxima leitura renova

**TTL = 300 s como rede de segurança:**
Se a invalidação falhar, a chave expira em 5 min — sem intervenção manual.

---

## Slide 9 — Conclusão

| Objetivo do enunciado           | Resultado medido                           |
|---------------------------------|--------------------------------------------|
| Reduzir latência                | <span class="badge-ok">55% menor ↓</span> em todos os percentis |
| Diminuir carga no banco         | <span class="badge-ok">43,5% menos consultas ↓</span>           |
| Melhorar desempenho             | <span class="badge-ok">+108% throughput ↑</span>                |
| Demonstrar hit / miss           | <span class="badge-metric">59,1% hit rate · 49 invalidações</span> |
| Discutir consistência           | <span class="badge-ok">Eventual · invalidate-on-write · TTL 300 s</span> |

**Lições:**
1. Cache-aside dá controle total — e responsabilidade total — para a aplicação
2. Invalidar é mais seguro que atualizar: elimina dado inconsistente ativo no Redis
3. TTL não é apenas otimização de memória — é rede de segurança para falhas de invalidação
4. 59% de hit rate já entrega ganho expressivo; sistemas reais com dados estáveis atingem 80–95%
