# Guia de apresentação — Métricas obrigatórias

Este documento mapeia as **7 métricas obrigatórias** da apresentação para os elementos
concretos que as demonstram: seção do `/report`, script ou documento.

---

## Mapa das 7 métricas

| # | Métrica obrigatória | Onde ver | Como demonstrar |
|---|---|---|---|
| 1 | **Tempo médio de resposta sem cache** | `/report` → cartão "Latência p95" (coluna sem cache) e tabela "Latência média" | `summary-cache-off.json` já gerado |
| 2 | **Tempo médio de resposta com cache** | `/report` → cartão "Latência p95" (coluna com cache) e tabela "Latência média" | `summary-cache-on.json` já gerado |
| 3 | **Quantidade de consultas ao banco** | `/report` → seção "Métricas de Cache" → cartão "Consultas ao banco" | `capturar-stats.ps1` → `cache-stats-*.json` |
| 4 | **Leituras atendidas pelo cache** | `/report` → seção "Métricas de Cache" → cartão "Cache HITs" | mesmo arquivo |
| 5 | **Cache hit e cache miss** | `/report` → seção "Métricas de Cache" → cartões "HITs", "Misses" e "Hit rate %" | mesmo arquivo |
| 6 | **Impacto da invalidação do cache** | Terminal: `./demo-invalidacao.ps1` | demonstração ao vivo com latência HIT vs MISS e contadores |
| 7 | **Discussão sobre consistência** | `k6/CONSISTENCIA.md` | abrir o documento e comentar os tópicos |

---

## Como executar na apresentação

### Pré-requisito
Stack no ar:
```powershell
cd backend
make start        # sobe web, redis, postgres, report
```

### Passo 1 — Mostrar as métricas de latência (já prontas)
Abra **http://localhost:8080/report/** no navegador.
Os `summary-cache-*.json` já existem — os gráficos aparecem imediatamente.

### Passo 2 — Capturar as métricas de cache (contadores)
```powershell
./capturar-stats.ps1
```
Leva ~1-2 minutos. Ao terminar, **recarregue** `http://localhost:8080/report/` —
a seção "Métricas de Cache (obrigatórias)" aparece com os valores reais.

### Passo 3 — Demonstrar o impacto da invalidação (ao vivo)
```powershell
./demo-invalidacao.ps1
```
A saída no terminal mostra passo a passo:
1. MISS → banco consultado (latência alta)
2. HIT → Redis, banco não tocado (latência baixa)
3. escrita → chave invalidada
4. MISS novamente → banco consultado de novo

### Passo 4 — Discutir consistência
Abra `k6/CONSISTENCIA.md` e comente os tópicos:
- Modelo cache-aside
- Estratégia invalidate-on-write
- TTL de 300s como rede de segurança
- Consistência eventual vs consistência forte
- Trade-off: desempenho × atualidade

---

## Números esperados (referência)

Os valores abaixo são típicos com o dataset padrão (2000 pedidos, RATE=40). Os seus resultados
podem variar ligeiramente conforme hardware e carga do sistema.

| Métrica | Com cache | Sem cache |
|---|---|---|
| Latência média | ~80 ms | ~180 ms |
| Latência p95 | ~130 ms | ~320 ms |
| Throughput | ~55 req/s | ~25 req/s |
| Consultas ao banco | muito menor | base de referência |
| HITs | alto (após warm-up) | 0 |
| Hit rate | ~70-80% | 0% |
| Invalidações | > 0 (compras geram invalidações) | 0 |

---

## Documentos de apoio

| Documento | Conteúdo |
|---|---|
| `k6/GUIA-METRICAS.md` | Explica cada métrica do `/report` em linguagem simples |
| `k6/CONSISTENCIA.md` | Discussão completa sobre consistência de dados |
| `k6/README.md` | Como rodar os testes, modelo de carga, aprendizados do tuning |
| `k6/APRESENTACAO.md` | Este arquivo |
