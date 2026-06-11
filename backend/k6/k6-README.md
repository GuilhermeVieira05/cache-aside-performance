# Teste de carga — Cache-aside (k6 + interface comparativa)

Simula clientes navegando e comprando de forma **simultânea** para medir o ganho do
cache-aside. Roda dois cenários — **com cache** e **sem cache** — e apresenta o
comparativo numa interface web. Tudo via Docker (nenhuma instalação no host).

## O que tem aqui

| Arquivo | Função |
|---|---|
| `buy-flow.js` | Script k6: jornada navegar → ver produto → ver pedidos → comprar |
| `report/index.html` | Interface comparativa (servida por nginx em `:8080`) |
| `results/` | Saída dos runs (`summary-<label>.json`, `raw-<label>.json`) |
| `../run-comparison.ps1` | Orquestra os dois cenários de ponta a ponta |

## Pré-requisitos

Stack no ar (`make start` na pasta `backend/`). O runner re-semeia o banco (seed pesado)
antes de cada cenário, então não precisa popular manualmente.

## Rodar o comparativo completo

Na pasta `backend/`:

```powershell
./run-comparison.ps1                                  # RATE=40, dataset 2000 pedidos
./run-comparison.ps1 -Rate 60 -Orders 3000 -Products 800
```

Depois abra **http://localhost:8080/report/**.

O runner, para cada cenário (`cache-off` e `cache-on`):
1. `rails runner db/seed_load.rb` — dataset idêntico em massa (default 300 clientes /
   500 produtos / 2000 pedidos / ~6000 itens).
2. recria o `web` em **modo de teste de carga** (`LOAD_TEST_MODE=true`, `RAILS_MAX_THREADS=5`)
   com o `CACHE_ENABLED` do cenário.
3. `redis-cli FLUSHALL` — começa com cache frio.
4. espera `GET /up` e dispara o k6 contra `http://web:3000`.

## Rodar manualmente (sem o script)

```powershell
# sem cache
docker compose run --rm -e ORDERS=2000 -e PRODUCTS=500 -e CUSTOMERS=300 web ./bin/rails runner db/seed_load.rb
$env:CACHE_ENABLED='false'; $env:LOAD_TEST_MODE='true'; $env:RAILS_MAX_THREADS='5'
docker compose up -d --force-recreate web
docker compose exec -T redis redis-cli FLUSHALL
docker compose run --rm -e LABEL=cache-off -e RATE=40 k6 run --quiet --out json=/results/raw-cache-off.json /scripts/buy-flow.js

# com cache
docker compose run --rm -e ORDERS=2000 -e PRODUCTS=500 -e CUSTOMERS=300 web ./bin/rails runner db/seed_load.rb
$env:CACHE_ENABLED='true'; $env:LOAD_TEST_MODE='true'; $env:RAILS_MAX_THREADS='5'
docker compose up -d --force-recreate web
docker compose exec -T redis redis-cli FLUSHALL
docker compose run --rm -e LABEL=cache-on -e RATE=40 k6 run --quiet --out json=/results/raw-cache-on.json /scripts/buy-flow.js

docker compose up -d report   # interface em http://localhost:8080/report/
```

## Modelo de carga

- **Executor `ramping-arrival-rate`** (modelo aberto): mantém a mesma taxa de req/s nos
  dois cenários, então a degradação sem cache aparece de forma justa.
- **Estágios:** warm-up 30s (aquece o cache) → sobe à taxa-alvo 30s → platô 120s (medição)
  → ramp-down 10s. Nos defaults gera **~8.000–10.000 requisições por run** — suficiente
  para p95/p99 estáveis.
- **Mix de requisições:** cada jornada faz ~4 leituras (catálogo, 1–2 produtos, pedidos) e,
  com probabilidade `BUY_PROB`, 1 escrita (compra). Leituras dominam — é onde o cache atua.

### Variáveis (`-e` no k6 / parâmetros do script)

| Var | Default | Descrição |
|---|---|---|
| `BASE_URL` | `http://web:3000` | URL da API (definida no serviço `k6`) |
| `LABEL` | `run` | Rótulo → nome do arquivo de resultado |
| `RATE` | `80` | Taxa-alvo de req/s no platô |
| `BUY_PROB` | `0.25` | Fração das jornadas que terminam em compra |

## Como ler as métricas

Na interface (`:8080`), com/sem cache lado a lado:
- **Latência p95/p99** (`http_req_duration`) — deve cair bastante com cache.
- **Throughput** (`http_reqs`/s) — deve subir com cache.
- **Taxa de erro** (`http_req_failed`) e **iterações dropadas** (`dropped_iterations`) —
  sinais de saturação; tendem a aparecer sem cache quando os 3 threads do Puma saturam.
- **p95 por etapa** — `list_orders` (índice com JOINs) costuma ser o que mais melhora.

Cruze com os logs `[CACHE HIT]` / `[CACHE MISS]` no Grafana/Loki (`localhost:3001`).

## Por que estas escolhas (aprendizados do tuning)

Para o cache-aside mostrar ganho mensurável foram necessários três ajustes — todos
descobertos medindo:

1. **`LOAD_TEST_MODE=true`** (gate em `config/environments/development.rb`): desliga
   reload/autoload/log verboso do modo dev, que sozinhos somavam ~600ms por request e
   mascaravam qualquer diferença. Default desligado — não afeta o `make start` normal.
2. **Cache da string JSON** (controllers usam `to_json` dentro do `CacheService.fetch`):
   guardar o objeto Ruby (`as_json`) não adianta, porque o `to_json` (custo dominante)
   rodaria em todo HIT. Cacheando a string final, o HIT pula query **e** serialização.
   O Rails envia `String` em `render json:` sem re-serializar.
3. **Dataset moderado** (`db/seed_load.rb`, ~2000 pedidos): grande o bastante para a query
   com JOINs + serialização custar ~350ms (que o cache elimina → ~70ms), mas sem inflar o
   payload a ponto da transferência dominar. Datasets gigantes (10k+) deixam a resposta com
   dezenas de MB e a transferência passa a mandar nos dois cenários.

Resultado típico (RATE=40): com cache ~2x mais throughput e ~2x menos latência que sem cache.

## Observações

- **Concorrência** controlada por `RAILS_MAX_THREADS` (default do teste = 5). Suba junto o
  `pool` no `database.yml` se aumentar muito.
- O alvo é o **modo development** (`localhost:3000`), onde o cache Redis está configurado.
  Produção tem `force_ssl` e exigiria HTTPS/master key.
- Cada `/orders` e `/products` retorna a tabela inteira (sem paginação). Por isso o teto de
  throughput é modesto mesmo com cache — o cache reduz o trabalho de servidor, não o tamanho
  do payload.
