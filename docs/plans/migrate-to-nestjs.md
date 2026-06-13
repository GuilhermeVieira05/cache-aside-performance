# Plan: Migrate backend Rails → NestJS + Fastify + TypeORM

## Problem

O backend atual é Rails 7.2, que não está na lista de tecnologias permitidas pelo professor. A migração troca o runtime por NestJS com adaptador Fastify, mantendo comportamento idêntico: mesmas rotas, mesma lógica cache-aside, mesmo frontend, mesma infra de observabilidade.

## Goals

- Nova stack em `backend-node/` rodando em paralelo com `backend/` (Rails intacto durante a migração)
- Todas as rotas com comportamento idêntico ao Rails (mesmos status codes, mesmos campos JSON, mesmo header `X-Cache`)
- Frontend (`index.html`) servido pela nova stack sem alteração
- Infra Docker/Grafana/Loki/Promtail reaproveitada sem mudanças
- Shadow test validando rota por rota que as respostas são equivalentes

## Out of Scope

- Mudança de domínio (mantém customers/products/orders)
- Mudança no schema do banco (TypeORM usa o Postgres já existente)
- Alteração no frontend
- Alteração na stack de observabilidade (Grafana, Loki, Promtail)
- Remoção do backend Rails (feita somente após shadow test aprovado)

## Actors & Context

Trabalho acadêmico de Arquitetura de Software. O backend é consumido pelo frontend embutido (`index.html`) e por scripts k6 de benchmark. A apresentação exige demonstrar cache hit, miss e invalidação com métricas em tempo real.

## User Flows

### Happy path principal (leitura com cache)
1. Frontend chama `GET /customers`
2. NestJS consulta Redis — MISS na primeira vez
3. NestJS consulta Postgres, salva no Redis, retorna JSON com header `X-Cache: MISS`
4. Segunda chamada retorna com `X-Cache: HIT` sem tocar no banco

### Write com invalidação
1. Frontend chama `POST /customers` com payload
2. NestJS persiste no Postgres
3. NestJS invalida `customers:all` no Redis
4. Retorna com header `X-Cache: WRITE`

### Toggle de cache
1. Frontend chama `POST /cache/toggle`
2. NestJS inverte flag em memória
3. Leituras subsequentes bypassam Redis e vão direto ao banco

## Edge Cases & Failure Scenarios

- Redis indisponível: CacheService deve logar e fallback para banco (não quebrar o request)
- `GET /customers/:id` com ID inexistente: retornar 404
- `POST /orders` com `product_id` inválido: retornar 422 com mensagem de erro
- Transação de criação de order falha no meio: rollback completo, nenhum `order_item` persistido
- `POST /observability/reset_loki`: comunicação via Docker socket Unix — mesmo comportamento do Rails

## Acceptance Criteria

- [ ] `backend-node/` tem seu próprio `docker-compose.yml` ou é integrado ao compose existente na porta 3001
- [ ] Todas as rotas abaixo respondem com status code e corpo JSON idênticos ao Rails:
  - `GET/POST /customers`, `GET/PUT/PATCH/DELETE /customers/:id`
  - `GET/POST /products`, `GET/PUT/PATCH/DELETE /products/:id`
  - `GET/POST /orders`, `GET/PUT/PATCH/DELETE /orders/:id`
  - `GET /stats`, `POST /stats/reset`
  - `GET /cache/status`, `POST /cache/toggle`
  - `POST /observability/reset_loki`
- [ ] Header `X-Cache` presente em todas as respostas de leitura (HIT / MISS / DISABLED)
- [ ] Header `X-Cache: WRITE` em criações e atualizações
- [ ] Header `X-Cache: INVALIDATED` em deleções
- [ ] Frontend (`index.html`) acessível na raiz e funcionando sem alteração
- [ ] Logs no formato `[CACHE HIT] key=...`, `[CACHE MISS] key=...`, `[CACHE INVALIDATE] key=...` chegando no Loki
- [ ] Shadow test script passa com 0 divergências em todas as rotas

## Implementation Hints (sequência sugerida)

### Fase 1 — Scaffold NestJS
Criar `backend-node/` com NestJS CLI, instalar Fastify adapter, TypeORM, ioredis, configurar `AppModule` com `TypeOrmModule` e `CacheModule`.

### Fase 2 — Entities e migrations TypeORM
Criar entities `Customer`, `Product`, `Order`, `OrderItem` mapeando o schema existente (`db/schema.rb`). Usar `synchronize: false` e criar migration que gera o mesmo DDL — o banco já existe, a migration só precisa criar as tabelas se não existirem.

### Fase 3 — CacheService
Módulo `CacheModule` com `CacheService` injetável:
- `fetch(key, ttl, loader: () => T): Promise<[T, CacheStatus]>`
- `invalidate(...keys)`
- `enabled()` — lê `CACHE_ENABLED` env
- `toggle()` — flag em memória
- Logs em formato compatível com Promtail: `[CACHE HIT]`, `[CACHE MISS]`, `[CACHE INVALIDATE]`

### Fase 4 — CacheStats
Módulo `CacheStatsService` usando `ioredis` direto (mesma lógica do `cache_stats.rb`):
- `incr(field, by?)` — `HINCRBY cache_stats <field> <by>`
- `all()` — `HGETALL cache_stats` + cálculo de hit_rate
- `reset()` — `DEL cache_stats`

### Fase 5 — Controllers (customers, products, orders)
Três módulos independentes. Cada controller segue o mesmo padrão:
- Reads: `CacheService.fetch` + setar header `X-Cache`
- Writes: persistir + `CacheService.invalidate` + header `X-Cache: WRITE`
- Deletes: destruir + invalidar + header `X-Cache: INVALIDATED`
- Orders: lógica transacional de criação com `order_items`, `recalculate_total`

### Fase 6 — Controllers auxiliares
- `StatsController`: `GET /stats` → `CacheStatsService.all()`, `POST /stats/reset`
- `CacheController`: `GET /cache/status`, `POST /cache/toggle`
- `ObservabilityController`: `POST /observability/reset_loki` via Docker socket Unix (replicar a lógica de HTTP sobre Unix socket do Rails)

### Fase 7 — Servir o frontend estático
NestJS deve servir `public/index.html` na rota raiz usando `ServeStaticModule` ou middleware. Copiar o `index.html` atual para `backend-node/public/`.

### Fase 8 — Docker Compose e infra
Criar `backend-node/docker-compose.yml` baseado no existente:
- Serviço `web` com imagem NestJS na porta 3001 (Rails fica em 3000 para shadow test)
- Reaproveitando os serviços `postgres`, `redis`, `loki`, `grafana`, `promtail` já configurados
- Variáveis de ambiente idênticas: `DATABASE_URL`, `REDIS_URL`, `CACHE_ENABLED`, `CACHE_TTL_SECONDS`

### Fase 9 — Shadow Test (etapa final de validação)
Script (`scripts/shadow-test.sh` ou `scripts/shadow_test.ts`) que:
1. Chama cada rota no Rails (`:3000`) e no NestJS (`:3001`) em sequência
2. Compara status code, campos JSON relevantes, e presença do header `X-Cache`
3. Imprime PASS/FAIL por rota
4. Sai com código 1 se qualquer divergência for encontrada

Rotas cobertas pelo shadow test:
- `GET /customers` — lista, verifica array, status 200, X-Cache presente
- `GET /customers/:id` — item, verifica campos name/email, status 200
- `GET /customers/:id` (ID inválido) — status 404
- `POST /customers` — cria, status 201, X-Cache: WRITE
- `PUT /customers/:id` — atualiza, status 200
- `DELETE /customers/:id` — status 204, X-Cache: INVALIDATED
- Idem para `products` e `orders`
- `GET /stats` — verifica campos hits/misses/hit_rate
- `GET /cache/status` — verifica `{ enabled: true/false }`
- `POST /cache/toggle` — verifica que o status inverteu

## Open Questions

Nenhuma — todos os requisitos foram confirmados pelo usuário.
