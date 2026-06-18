# Cache Aside e Performance de APIs

## Introdução

APIs com consultas repetitivas sofrem com um problema clássico: toda leitura vai ao banco de dados, que reexecuta a mesma query do zero (parse do SQL, planejamento, acesso a disco, rede). Sob concorrência, o banco satura e a latência dispara.

O padrão **Cache Aside** coloca a aplicação no controle do cache: em cada leitura ela consulta primeiro o cache (Redis, em memória); se o dado existe, responde na hora (**cache hit**) sem tocar no banco; se não existe (**cache miss**), busca no banco, guarda no cache e responde. Em cada escrita, a aplicação **invalida** as chaves afetadas para nunca servir dado velho.

Este projeto implementa esse padrão de ponta a ponta e expõe, **em tempo real**, todas as métricas que comprovam o ganho: tempo médio de resposta com e sem cache, número de consultas ao banco, leituras atendidas pelo cache, hit/miss, impacto da invalidação e a discussão de consistência.

## O que o projeto demonstra

- **Tempo médio de resposta** medido no servidor e separado por categoria: **cache HIT**, **cache MISS** e **SQL sem cache**.
- **Quantidade de consultas ao banco** vs **leituras atendidas pelo cache**.
- **Cache hit / cache miss** e **hit rate** ao vivo.
- **Impacto da invalidação**: ao escrever, as páginas do recurso são invalidadas e a próxima leitura volta a ser MISS.
- **Consistência dos dados**: invalidação explícita na escrita + TTL no Redis (consistência eventual). Discussão detalhada em [`docs/CONSISTENCIA.md`](docs/CONSISTENCIA.md).

Todas as métricas são **calculadas pelo backend** (contadores e tempos acumulados no Redis) e expostas via `GET /stats`; o frontend e o Grafana apenas exibem — o que torna os números verificáveis e não-mockáveis.

## Arquitetura

```
Cliente (SPA)
   │  HTTP
   ▼
NestJS + Fastify ── Cache Aside ──► Redis (cache + contadores de métricas)
   │
   └──────────────► PostgreSQL (fonte da verdade)

Logs da aplicação ──► Promtail ──► Loki ──► Grafana (dashboards)
```

- **Backend:** NestJS 11 sobre Fastify, TypeORM.
- **Banco:** PostgreSQL 16.
- **Cache:** Redis 7.
- **Observabilidade:** Promtail + Loki + Grafana.
- **Frontend:** SPA em HTML/JS servida pelo próprio NestJS.
- **Teste de carga:** k6.

### Modelo de dados

```
Customer ──< Order ──< OrderItem >── Product
```

### Cache Aside (`backend/src/cache/cache.service.ts`)

`CacheService` é o ponto único de cache. `fetch(key, ttl, loader)` faz read-through (HIT/MISS), mede a duração de cada caminho e acumula as métricas no Redis; `invalidate` / `invalidatePattern` removem chaves nas escritas. As listagens são paginadas, com uma chave de cache por página (`<recurso>:page:<n>:size:<m>`); ao escrever, todas as páginas do recurso são invalidadas.

## Estrutura do projeto

```
.
├── backend/
│   ├── src/
│   │   ├── cache/              # CacheService (núcleo do padrão cache-aside)
│   │   ├── cache-stats/        # contadores e médias expostos via /stats
│   │   ├── stats/              # controller de /stats e /stats/reset
│   │   ├── cache-status/       # /cache/status e /cache/toggle
│   │   ├── customers/          # entidade + service + controller (paginado)
│   │   ├── products/           # idem
│   │   ├── orders/             # idem (com itens aninhados)
│   │   ├── common/             # helpers de paginação
│   │   ├── observability/      # endpoints de observabilidade
│   │   ├── logging.interceptor.ts
│   │   └── main.ts
│   ├── public/                 # frontend (painel de métricas ao vivo)
│   ├── observability/          # configs de Grafana, Loki, Promtail
│   ├── k6/                     # cenário de teste de carga
│   ├── scripts/                # seed e scripts de load test
│   ├── docker-compose.yml
│   └── Makefile
├── docs/                       # documentação complementar
└── README.md
```

## Como rodar

Pré-requisitos: **Docker** e **Docker Compose**. Todos os comandos abaixo rodam de dentro de `backend/`.

```bash
cd backend

# Sobe toda a stack (app, banco, redis, grafana, loki, promtail)
make start

# Popula o banco: 10.000 clientes / 1.000 produtos / 50.000 pedidos
make seed
```

Acesse:

| Serviço | URL | Credenciais |
|---|---|---|
| Painel de métricas (frontend) | http://localhost:3000 | — |
| Métricas cruas (JSON) | http://localhost:3000/stats | — |
| Grafana (dashboards) | http://localhost:3001 | `admin` / `admin` |

Outros comandos úteis:

```bash
make logs           # acompanha os logs da aplicação
make stop           # derruba a stack (mantém os dados)
make reset          # apaga volumes e sobe limpo (precisa rodar make seed de novo)
make loadtest-live  # teste de carga ao vivo: compara SEM cache vs COM cache
```

### Principais endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/products?page=&pageSize=` | lista paginada (idem `/customers`, `/orders`) |
| GET | `/products/:id` | registro único |
| POST/PUT/DELETE | `/products` | escrita (invalida o cache do recurso) |
| GET | `/stats` | todas as métricas calculadas no servidor |
| POST | `/stats/reset` | zera os contadores |
| GET | `/cache/status` | estado do cache (ligado/desligado) |
| POST | `/cache/toggle` | liga/desliga o cache em runtime |

Cada resposta de leitura traz o header `X-Cache` (`HIT` / `MISS` / `DISABLED`), tornando o comportamento do cache transparente por requisição.

### Variáveis de ambiente

| Variável | Padrão | Função |
|---|---|---|
| `CACHE_ENABLED` | `true` | liga/desliga o cache-aside (use `false` para o baseline sem cache) |
| `CACHE_TTL_SECONDS` | `300` | TTL das chaves no Redis |
| `REDIS_URL` | `redis://redis:6379/0` | conexão com o Redis |
| `DATABASE_URL` | (no docker-compose) | conexão com o Postgres |

## Observabilidade

A aplicação loga cada evento de cache (`[CACHE HIT|MISS|DISABLED|INVALIDATE]`) com a duração medida. Promtail coleta os logs, envia ao Loki, e o Grafana exibe — entre outros — o painel **"Tempo médio de resposta por tipo (HIT / MISS / SQL sem cache)"**. Como o Grafana lê de um pipeline independente do `/stats`, os dois funcionam como provas cruzadas das mesmas métricas.

## Conclusão

O Cache Aside não é apenas uma otimização de leitura: é uma decisão arquitetural com efeito sistêmico. Os testes de carga deste projeto mostram que, com o cache ativo, a latência média cai expressivamente, o throughput aumenta e o número de consultas ao banco despenca — e, sob concorrência, o cache ainda **protege o banco da saturação**, fazendo com que até os cache-misses fiquem mais rápidos do que o cenário sem cache. Em troca, o padrão introduz o desafio da **consistência eventual**, mitigado aqui pela invalidação explícita em toda escrita e por um TTL curto. Para dados que exigem consistência forte, padrões como write-through podem ser mais adequados — mas para o cenário de leituras muito mais frequentes que escritas, o Cache Aside entrega o melhor custo-benefício entre simplicidade, performance e controle.
