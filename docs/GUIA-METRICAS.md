# Guia das métricas do relatório (`/report`)

Este documento explica, em linguagem simples, **cada número que aparece na página**
`http://localhost:8080/report/`. Não precisa conhecer k6 nem termos técnicos: cada
seção diz **o que é**, **como ler** e **se "maior" ou "menor" é melhor**.

---

## 1. O que este relatório mostra

A gente roda **o mesmo teste duas vezes** e mostra os dois lado a lado:

- 🟢 **Com cache** (`CACHE_ENABLED=true`) — o sistema guarda respostas prontas no Redis.
- 🔴 **Sem cache** (`CACHE_ENABLED=false`) — toda requisição vai ao banco de dados.

Em cada número aparece uma seta com porcentagem, por exemplo **▲ 110%**. Ela indica
**quanto o cache melhorou** aquele item em relação ao "sem cache". Verde = melhorou,
vermelho = piorou.

O objetivo é responder: *"ligar o cache deixa o sistema mais rápido e aguenta mais gente
ao mesmo tempo?"*

---

## 2. Conceitos básicos (leia primeiro)

### Requisição
Um único pedido ao servidor. Exemplos: "me dê a lista de produtos", "me dê o produto 42".
Cada clique/ação do cliente vira uma ou mais requisições.

### Jornada do cliente
Uma "visita" completa de um cliente simulado, feita de várias requisições em sequência:

| Etapa na tela | O que o cliente faz | Requisição |
|---|---|---|
| **Catálogo** | abre a lista de produtos | `GET /products` |
| **Produto** | abre 1–2 produtos para ver detalhes | `GET /products/:id` |
| **Pedidos** | vê a lista de pedidos | `GET /orders` |
| **Compra** | finaliza uma compra (nem toda visita compra) | `POST /orders` |

O teste dispara **muitas dessas jornadas ao mesmo tempo**, simulando vários clientes
simultâneos comprando.

### Latência
**Quanto tempo o servidor levou para responder UMA requisição.** Medida em **milissegundos
(ms)** — lembrando que **1.000 ms = 1 segundo**.
👉 **Quanto menor, melhor.** (Resposta mais rápida = cliente menos esperando.)

### Throughput (vazão)
**Quantas requisições o servidor consegue responder por segundo** (`req/s`). É a "capacidade"
do sistema sob carga.
👉 **Quanto maior, melhor.** (Aguenta mais clientes ao mesmo tempo.)

### Percentil (a parte que mais confunde — com analogia)
Imagine **ordenar todas as respostas da mais rápida para a mais lenta** e colocá-las numa fila.
O percentil é "onde você está nessa fila":

- **p95 = 23 ms** significa: **95% das respostas foram mais rápidas que 23 ms**; só os 5%
  mais lentos passaram disso.
- **p99 = 40 ms**: 99% foram mais rápidas que 40 ms; só o 1% pior passou disso.

Por que não usar só a **média**? Porque a média esconde os casos ruins. Um sistema pode ter
média boa mas alguns clientes esperando muito. O **p95** mostra a experiência do
**"pior caso comum"** — é a métrica que melhor representa o que o cliente realmente sente.

> Resumo da família de latências, da mais otimista para a mais pessimista:
> **média → p90 → p95 → p99 → máxima**.

---

## 3. Os três cartões do topo

| Cartão | O que é | Melhor quando |
|---|---|---|
| **Latência p95** | Tempo de resposta no pior caso típico (95% das requisições foram mais rápidas que isso). | menor |
| **Throughput (req/s)** | Quantas requisições por segundo o servidor entregou. | maior |
| **Taxa de erro** | Porcentagem de requisições que falharam (não retornaram sucesso). | menor (ideal 0%) |

Cada cartão mostra o valor **com cache** e **sem cache**, e a seta com o ganho.

---

## 4. Os gráficos

### Latência geral por percentil (ms)
Quatro barras — **média, p90, p95, p99** — comparando com/sem cache. Serve para ver não só
o tempo típico (média) mas também **quão ruins ficam os casos mais lentos** (p99). Se as
barras do "com cache" são bem menores, o cache deixou o sistema mais rápido em todos os níveis.
👉 **Barras menores = melhor.**

- **média** — tempo de resposta típico, somando tudo e dividindo.
- **p90** — 90% das respostas foram mais rápidas que isso.
- **p95** — 95% mais rápidas que isso (referência principal).
- **p99** — 99% mais rápidas que isso (mostra a "cauda" mais lenta; importa porque é o
  cliente azarado que tem a pior experiência).

### p95 por etapa da jornada (ms)
Mostra o **p95 de cada passo** da jornada: **Catálogo, Produto, Pedidos, Compra**. Serve para
descobrir **qual etapa é o gargalo**.
Normalmente **Pedidos** (`GET /orders`) é a mais lenta sem cache, porque o banco precisa juntar
pedidos + itens + produtos (consulta com "JOINs", mais pesada). É também a que **mais melhora**
com o cache.
👉 **Barras menores = melhor.**

### Throughput — requisições por segundo
Uma barra com cache e outra sem. Mostra direto **quantas requisições por segundo** cada
configuração aguentou.
👉 **Barra maior = melhor.**

### Taxa de erro (%)
Uma barra com cache e outra sem, com a porcentagem de falhas.
👉 **Barra menor = melhor** (0% é o ideal).

---

## 5. A tabela comparativa (linha a linha)

| Linha | O que significa | Melhor quando |
|---|---|---|
| **Requisições totais** | Quantas requisições foram feitas no teste inteiro. Quanto mais o servidor aguenta, mais ele consegue processar no mesmo tempo. | maior |
| **Throughput (req/s)** | Requisições respondidas por segundo (a vazão). | maior |
| **Latência média** | Tempo de resposta típico. | menor |
| **Latência p90** | 90% das respostas foram mais rápidas que isso. | menor |
| **Latência p95** | 95% das respostas foram mais rápidas que isso (referência principal). | menor |
| **Latência p99** | 99% das respostas foram mais rápidas que isso (a cauda lenta). | menor |
| **Latência máxima** | A resposta mais lenta de todas no teste (o pior caso absoluto). | menor |
| **Taxa de erro** | % de requisições que falharam. | menor |
| **Iterações dropadas** | Jornadas que o k6 **queria** disparar, mas o servidor estava tão ocupado que elas foram descartadas. É um **sinal de saturação**: quanto mais dropadas, mais o servidor não deu conta da carga. | menor |
| **p95 — catálogo** | p95 só do passo "abrir o catálogo" (`GET /products`). | menor |
| **p95 — ver pedidos** | p95 só do passo "ver pedidos" (`GET /orders`) — costuma ser o mais pesado. | menor |
| **p95 — compra** | p95 só do passo "finalizar compra" (`POST /orders`). | menor |

---

## 6. Como interpretar o nosso resultado

No nosso teste (mesma carga nos dois cenários), **ligar o cache** entregou aproximadamente:

- **~2x mais throughput** (o servidor respondeu cerca do dobro de requisições por segundo);
- **~2x menos latência** no p95 (cada resposta levou cerca da metade do tempo);
- **menos iterações dropadas** (aguentou mais carga antes de saturar).

**Por quê?** Sem cache, toda visita refaz a consulta pesada de pedidos no banco e remonta a
resposta. Com cache, essa resposta já vem pronta do Redis, liberando o servidor muito mais
rápido para atender o próximo cliente — por isso a latência cai e a vazão sobe.

> Observação honesta: como os endpoints devolvem a tabela inteira (sem paginação), os tempos
> absolutos ficam altos nos dois casos sob carga pesada. O importante aqui é a **comparação
> relativa**: com cache é consistentemente mais rápido e aguenta mais.
