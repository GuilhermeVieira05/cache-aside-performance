# Consistência de dados no cache-aside

## O modelo cache-aside

No padrão **cache-aside**, o cache não é preenchido automaticamente — a aplicação decide quando
ler do cache e quando ir ao banco:

```
leitura:
  1. busca no Redis  →  HIT:  devolve direto (sem tocar o banco)
                    →  MISS: busca no banco, grava no Redis, devolve

escrita:
  2. persiste no banco
  3. invalida a chave no Redis (apaga)
```

A próxima leitura após uma escrita sempre vai ao banco (MISS) e renova o cache.

---

## Estratégia de consistência: invalidate-on-write

Este projeto usa **invalidação imediata na escrita**. Ao criar, atualizar ou destruir um
recurso, o controller apaga as chaves afetadas:

```ruby
# orders_controller.rb — create
CacheService.invalidate("orders:all")

# orders_controller.rb — update / destroy
CacheService.invalidate("orders:all", "orders:#{@order.id}")
```

O mesmo padrão vale para `products` e `customers`.

**Por que invalidar em vez de atualizar o cache?**
Atualizar exige serializar o objeto novamente e garantir atomicidade; invalidar é mais simples
e elimina a janela de cache inconsistente de forma segura.

---

## TTL de 300 segundos como rede de segurança

Mesmo que uma invalidação falhe (ex.: Redis momentaneamente indisponível), as chaves expiram
em **5 minutos** (`CACHE_TTL_SECONDS=300`). Isso limita a defasagem máxima: depois de 5 min o
sistema volta ao estado correto por si só, sem intervenção manual.

---

## Granularidade das chaves

As chaves `:all` (ex.: `orders:all`) guardam a **lista completa** de registros. Isso tem um
custo: qualquer escrita invalida a lista inteira, forçando a próxima leitura a recarregar tudo
do banco.

| Chave | Invalida quando |
|---|---|
| `orders:all` | qualquer pedido criado/alterado/deletado |
| `orders:42` | pedido 42 alterado/deletado |
| `products:all` | qualquer produto criado/alterado/deletado |
| `products:7` | produto 7 alterado/deletado |

Em sistemas com muita escrita e listas grandes, a granularidade mais grossa aumenta a taxa de
MISS. Para este projeto de demonstração — onde leituras dominam (BUY_PROB = 25%) — a taxa de
HIT ainda é alta.

---

## Janela de inconsistência (consistência eventual)

Entre o momento de uma escrita e o momento em que todos os leitores recebem a versão nova,
existe uma **janela de leitura possivelmente desatualizada**:

```
t0: cliente A lê orders:all  →  HIT (dados do Redis)
t1: cliente B cria um pedido →  banco atualizado, orders:all invalidado
t2: cliente A lê orders:all de novo  →  MISS  →  banco  →  dados atualizados
```

No pior caso, entre t0 e t1, cliente A vê a lista sem o novo pedido. Essa é a
**inconsistência eventual**: o sistema converge para o estado correto, mas não garante leitura
atualizada no instante exato da escrita.

---

## Condições de corrida clássicas do cache-aside

| Cenário | O que acontece | Mitigação neste projeto |
|---|---|---|
| Duas leituras simultâneas no MISS | ambas vão ao banco, a segunda sobrescreve o cache com o mesmo dado | inofensivo (dados idênticos); a gem `redis-client` é thread-safe |
| Leitura após escrita (antes da invalidação chegar) | leitura vê dado antigo | janela mínima (invalidação síncrona no controller, mesma transação HTTP) |
| Redis indisponível | `CacheService.fetch` captura exceção (comportamento padrão do Rails cache) e cai no bloco (vai ao banco) | TTL como fallback; sem perda de dados |

---

## Conclusão: consistência eventual com defasagem limitada

Este projeto garante:

- **Consistência eventual**: após qualquer escrita, todos os leitores convergem para o estado
  correto no prazo de uma nova requisição (invalidação imediata) ou, no máximo, 5 minutos (TTL).
- **Não garante consistência forte** (leitura sempre ver o estado mais recente):
  leituras concorrentes à escrita podem ver dados levemente desatualizados durante a janela de
  invalidação.

O **trade-off** é explícito: aceitamos essa janela mínima de inconsistência em troca de
**~2× mais throughput** e **~2× menos latência** sob carga — o que faz sentido para dados de
catálogo e listagens, onde pequenas defasagens são toleráveis.
