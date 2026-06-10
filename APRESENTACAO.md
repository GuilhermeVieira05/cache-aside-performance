# Cache Aside e Performance de APIs
### Arquitetura de Software — 5º período | PUC Minas

---

## Slide 1 — Problema

**Contexto:** API acadêmica com consultas repetitivas que sobrecarregam o banco.

- Toda requisição de leitura vai ao PostgreSQL
- Dados de catálogo (produtos, clientes, pedidos) mudam pouco, mas são lidos com frequência
- Sob carga, o banco vira gargalo: latência dispara, throughput cai

**Solução proposta:** padrão **Cache Aside** com Redis como camada intermediária

---

## Slide 2 — O Padrão Cache Aside

```
LEITURA
  1. Consulta o Redis
     → HIT:  retorna direto (banco não é tocado)
     → MISS: consulta o banco → grava no Redis → retorna

ESCRITA
  1. Persiste no banco
  2. Invalida a chave no Redis (apaga)
  → próxima leitura vai ao banco e renova o cache
```

**Por que cache-aside e não write-through?**
A aplicação controla o cache explicitamente — sem biblioteca opaca, sem sincronização implícita.
Invalidar é mais simples e seguro do que atualizar o cache: elimina janelas de inconsistência.

---

## Slide 3 — Arquitetura da Solução

```
Cliente HTTP
    │
    ▼
Rails 7.2 (API-only)
    │
    ├── CacheService.fetch(key) { ... }
    │       ├── [HIT]  Redis ← resposta imediata
    │       └── [MISS] PostgreSQL → Redis → resposta
    │
    ├── CacheService.invalidate(*keys)
    │       └── apaga chaves no Redis após escrita/update/delete
    │
    └── CacheStats (contadores em Redis hash)
            └── hits / misses / invalidations / db_queries

Observabilidade:
    Rails logs → Promtail → Loki → Grafana (:3001)
    Relatório k6 → http://localhost:8080/report/
```

**Stack:** Rails 7.2 · PostgreSQL 16 · Redis 7 · Docker Compose · k6 · Grafana/Loki

---

## Slide 4 — Implementação (código real)

### `CacheService` — entrada única para o cache

```ruby
# app/services/cache_service.rb
module CacheService
  TTL = ENV.fetch("CACHE_TTL_SECONDS", 300).to_i.seconds

  def self.fetch(key, ttl: TTL)
    return yield unless enabled?

    cached = Rails.cache.read(key)
    unless cached.nil?
      Rails.logger.info("[CACHE HIT] key=#{key}")
      CacheStats.incr("hits")
      return cached           # banco não é tocado
    end

    Rails.logger.info("[CACHE MISS] key=#{key}")
    CacheStats.incr("misses")
    value = yield             # consulta o banco
    Rails.cache.write(key, value, expires_in: ttl)
    value
  end

  def self.invalidate(*keys)
    keys.each do |key|
      Rails.cache.delete(key)
      Rails.logger.info("[CACHE INVALIDATE] key=#{key}")
    end
    CacheStats.incr("invalidations", keys.size)
  end
end
```

### Controller — padrão aplicado uniformemente

```ruby
# app/controllers/customers_controller.rb
def index
  customers = CacheService.fetch("customers:all") { Customer.order(:id).to_json }
  render json: customers
end

def update
  if @customer.update(customer_params)
    CacheService.invalidate("customers:all", "customers:#{@customer.id}")
    render json: @customer
  end
end
```

### Chaves de cache

| Recurso   | Lista            | Registro individual  |
|-----------|------------------|----------------------|
| Customers | `customers:all`  | `customers:<id>`     |
| Products  | `products:all`   | `products:<id>`      |
| Orders    | `orders:all`     | `orders:<id>`        |

---

## Slide 5 — Metodologia dos Testes

**Ferramenta:** k6 (Grafana) — teste de carga com usuários virtuais simultâneos

**Jornada simulada por usuário:**

| Etapa     | Requisição              | Descrição                              |
|-----------|-------------------------|----------------------------------------|
| Catálogo  | `GET /products`         | Lista todos os produtos                |
| Produto   | `GET /products/:id`     | Detalha 1–2 produtos                   |
| Pedidos   | `GET /orders`           | Lista todos os pedidos (JOIN pesado)   |
| Compra    | `POST /orders` (25%)    | Cria pedido → invalida cache           |

**Parâmetros do teste:**
- 200 usuários virtuais simultâneos (ramp-up progressivo)
- 40 req/s de taxa de chegada
- Dataset: 300 clientes · 500 produtos · 2000 pedidos
- Mesma seed nos dois cenários (condições idênticas)
- Cache zerado (`FLUSHALL`) antes de cada run

**Dois cenários:**
- `cache-off`: `CACHE_ENABLED=false` — toda requisição vai ao banco
- `cache-on`: `CACHE_ENABLED=true` — padrão cache-aside ativo

---

## Slide 6 — Resultados: Latência

| Métrica           | Sem cache    | Com cache    | Melhora      |
|-------------------|-------------:|-------------:|:------------:|
| **Latência média**| 12.379 ms    | 5.471 ms     | **−55,8%**   |
| **Latência p90**  | 16.686 ms    | 7.461 ms     | **−55,3%**   |
| **Latência p95**  | 17.290 ms    | 7.713 ms     | **−55,4%**   |
| **Latência p99**  | 17.889 ms    | 8.170 ms     | **−54,3%**   |
| **Latência máx.** | 18.786 ms    | 9.010 ms     | **−52,0%**   |

> O cache reduziu em ~55% o tempo de resposta em todos os percentis.
> O p95 passou de 17,3 s para 7,7 s — ou seja, 95% das requisições ficaram abaixo de 7,7 s com cache.

---

## Slide 7 — Resultados: Throughput e Volume

| Métrica                  | Sem cache | Com cache | Melhora       |
|--------------------------|----------:|----------:|:-------------:|
| **Requisições totais**   | 2.982     | 6.044     | **+102,7%**   |
| **Throughput (req/s)**   | 13,54     | 28,14     | **+107,8%**   |
| **Iterações concluídas** | 728       | 1.617     | **+122,1%**   |
| **Iterações dropadas**   | 5.450     | 4.657     | **−14,5%**    |

> Com cache, o servidor entregou mais que o dobro de requisições no mesmo tempo
> e completou 2,2× mais jornadas de cliente.

---

## Slide 8 — Cache Hit, Miss e Invalidação

Medido durante o cenário `cache-on` com 200 usuários virtuais:

| Contador        | Valor    |
|-----------------|:--------:|
| **Cache HITs**  | 420      |
| **Cache MISSes**| 291      |
| **Hit Rate**    | **59,1%**|
| **Invalidações**| 49       |

**Consultas ao banco:**

| Cenário     | Consultas ao banco |
|-------------|:------------------:|
| Sem cache   | 1.422              |
| Com cache   | 804                |
| **Redução** | **−43,5%**         |

> Com ~60% de hit rate, o banco recebeu quase metade das consultas.
> As 49 invalidações correspondem às compras realizadas (`POST /orders`) durante o teste —
> toda compra apaga as chaves `orders:all` e renova o cache na próxima leitura.

---

## Slide 9 — Demonstração: Ciclo Cache-Aside ao Vivo

**Fluxo observável nos logs (`[CACHE HIT]` / `[CACHE MISS]` / `[CACHE INVALIDATE]`):**

```
1. GET /products        → [CACHE MISS]  banco consultado, chave gravada no Redis
                           latência alta (~50-200 ms)

2. GET /products        → [CACHE HIT]   Redis responde, banco não tocado
                           latência baixa (~5-30 ms)

3. PUT /products/42     → [CACHE INVALIDATE] keys: products:all, products:42
                           banco atualizado, chaves apagadas do Redis

4. GET /products        → [CACHE MISS]  banco consultado novamente, ciclo recomeça
```

**Endpoint de métricas em tempo real:** `GET /stats`
```json
{
  "hits": 420,
  "misses": 291,
  "hit_rate": 59.07,
  "invalidations": 49,
  "db_queries": 804
}
```

---

## Slide 10 — Consistência dos Dados

**Modelo adotado: consistência eventual com defasagem limitada**

| Garantia                     | Este projeto          |
|------------------------------|-----------------------|
| Consistência forte (sempre atualizado) | ✗ Não garante |
| Consistência eventual (converge rápido) | ✓ Sim         |
| Defasagem máxima             | **≤ 300 s (TTL)**     |
| Defasagem típica             | **próxima requisição**|

**Estratégia: `invalidate-on-write`**
- Escrita → banco persistido → chave apagada do Redis
- Próxima leitura: MISS → banco → Redis renovado
- Não há janela de dado desatualizado ativo; a chave é apagada, não atualizada

**Condição de corrida:** duas leituras simultâneas no MISS fazem duas consultas ao banco —
ambas gravam o mesmo dado no Redis. Inofensivo, pois o dado é idêntico. A gem `redis-client`
é thread-safe.

**TTL (300 s) como rede de segurança:**
Se uma invalidação falhar (Redis momentaneamente indisponível), a chave expira em 5 minutos
e o sistema volta ao estado correto sem intervenção.

**Trade-off explícito:**
> Aceitamos leitura eventualmente desatualizada durante a janela de invalidação em troca de
> **~2× mais throughput** e **~55% menos latência** — aceitável para dados de catálogo.

---

## Slide 11 — Análise dos Trade-offs Arquiteturais

| Dimensão             | Sem cache                          | Com cache                          |
|----------------------|------------------------------------|------------------------------------|
| **Latência de leitura** | Alta (banco toda vez)           | Baixa nos HITs, alta nos primeiros MISSes |
| **Throughput**       | Limitado pela capacidade do banco  | ~2× maior                          |
| **Consistência**     | Forte (banco é fonte de verdade)   | Eventual (janela de invalidade mínima) |
| **Complexidade**     | Simples                            | Maior (invalidação, TTL, hit/miss) |
| **Resiliência**      | Ponto único: banco                 | Redis offline → fallback automático ao banco |
| **Custo de memória** | Zero extra                         | Redis ~MB para dados de catálogo   |
| **Warm-up**          | Não necessário                     | Primeiras requisições são MISSes   |

**Quando cache-aside faz sentido:**
- Leituras muito mais frequentes que escritas (read-heavy)
- Dados com baixa volatilidade (catálogo, listagens)
- Tolerância a consistência eventual
- Latência de banco > latência aceitável sob carga

---

## Slide 12 — Conclusão

**Resultados obtidos com o padrão Cache Aside:**

| Objetivo do enunciado           | Resultado medido              |
|---------------------------------|-------------------------------|
| Reduzir latência                | ✓ −55% em todos os percentis |
| Diminuir carga no banco         | ✓ −43,5% de consultas        |
| Melhorar desempenho de consultas| ✓ +108% de throughput        |
| Demonstrar hit/miss/invalidação | ✓ 59,1% hit rate · 49 invalidações |
| Discutir consistência           | ✓ Consistência eventual documentada |

**Lições arquiteturais:**
1. Cache-aside transfere a lógica de coerência para a aplicação — mais controle, mais responsabilidade
2. Invalidar é mais seguro que atualizar: elimina a janela de dado inconsistente ativo
3. O TTL é uma rede de segurança essencial, não apenas uma otimização de memória
4. Hit rate de 59% já entrega ganho expressivo; sistemas reais com dados mais estáveis atingem 80-95%

---

## Referências Rápidas para a Apresentação

| O que mostrar         | Onde                                    |
|-----------------------|-----------------------------------------|
| Relatório comparativo | `http://localhost:8080/report/`         |
| Logs ao vivo          | `make logs` → filtrar `[CACHE`          |
| Métricas em tempo real| `GET http://localhost:3000/stats`       |
| Demo invalidação      | `./demo-invalidacao.ps1`                |
| Grafana               | `http://localhost:3001` (admin/admin)   |
| Consistência          | `backend/k6/CONSISTENCIA.md`           |
