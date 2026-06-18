# Roteiro de Apresentação — Cache Aside e Performance de APIs
**Disciplina:** Arquitetura de Software · PUC Minas  
**Duração estimada:** ~20 minutos  
**Distribuição:** 5 pessoas (~4 min cada)

---

## Antes de começar
- Deixar o servidor rodando: `cd backend && make start`
- Abrir no browser: `http://localhost:3000` (frontend) e `http://localhost:3001` (Grafana, admin/admin)
- Rodar o seed: `make seed`
- Ter o slide 1 na tela
- Deixar o terminal visível ao lado para mostrar os logs se necessário

---

## 🎤 PESSOA 1 — Introdução e O Problema
**Slides 1, 2 e 3 · ~4 minutos**

---

### Slide 1 — Capa
> *"Bom dia a todos. Nosso trabalho é sobre Cache Aside e Performance de APIs. O título parece simples, mas o que a gente vai mostrar hoje é uma decisão arquitetural que reduziu nossa latência em 55% e dobrou a capacidade do sistema — sem mudar o banco, sem mudar o servidor, sem adicionar hardware."*

---

### Slide 2 — O Problema
> *"O cenário que o trabalho propõe é clássico: uma API acadêmica com consultas repetitivas. Mas isso se aplica a qualquer sistema real — e-commerce, banco, rede social."*

> *"O problema é simples: toda vez que alguém faz uma listagem de produtos, o banco de dados executa um SELECT do zero. Parseia a query, acessa o disco, monta o resultado. Se cem pessoas fazem isso ao mesmo tempo, o banco faz cem vezes o mesmo trabalho."*

> *"No nosso teste de carga, com 200 usuários simultâneos e o banco saturado, a latência sem cache subiu para a casa das centenas de milissegundos — média ~230 ms, p95 ~690 ms. E em apenas 3 minutos o banco recebeu cerca de 38 mil consultas, muitas delas idênticas."*

---

### Slide 3 — Por que o cache é mais rápido?
> *"Antes de falar do padrão, é importante entender o POR QUÊ. Não é mágica — é física."*

> *"Tudo é sobre onde os dados estão armazenados fisicamente. Um processador acessa o L1 cache em 1 nanosegundo. A RAM — onde o Redis fica — em cerca de 100 nanosegundos."*

> *"Agora compare com o PostgreSQL: quando você faz uma query, o banco precisa parsear o SQL, planejar a execução, acessar o disco — e ainda tem o roundtrip de rede. Estamos falando de 10 a 100 milissegundos. Isso é 100.000 vezes mais lento que a RAM."*

> *"Mas atenção: se fosse só uma questão de 'estar na RAM', qualquer cache resolveria. Na próxima parte o pessoal vai abrir o capô do Redis e mostrar por que, na arquitetura dele, ele é tão eficiente."*

---

## 🎤 PESSOA 2 — Por dentro do Redis e o Padrão Cache Aside
**Slides 4 e 5 · ~4 minutos**

---

### Slide 4 — Por dentro do Redis (não é só RAM)
> *"Como foi dito, a RAM explica a velocidade bruta. Mas o Redis é eficiente por causa da arquitetura dele. Vou destacar quatro pontos."*

> *"Primeiro: o Redis é single-thread. Parece limitação, mas é o contrário. Um único loop de eventos processa um comando por vez, de forma atômica. Sem locks, sem troca de contexto, sem condição de corrida — que é exatamente o que trava um banco relacional sob alta concorrência."*

> *"Segundo: as estruturas de dados. Strings, hashes, sorted sets — tudo nativo, escrito em C, com operações de tempo constante, O(1). Buscar uma chave é um acesso direto numa hash table; não tem varredura de linha nem índice em disco para percorrer."*

> *"Terceiro, talvez o mais importante: não existe query planner. No Postgres, toda query passa por parse do SQL, escolha de plano e otimizador. No Redis nada disso acontece — você pede a chave, ele devolve o valor. A etapa inteira de 'parse → plano → execução' simplesmente não existe."*

> *"E quarto: I/O multiplexado. Uma única thread atende milhares de conexões com I/O não-bloqueante, usando epoll. E com pipelining, vários comandos viajam numa única ida e volta de rede."*

> *"Então a resposta completa é: o Redis é rápido não só porque está na RAM, mas porque tirou SQL, locks e disco da equação. Por isso cada GET custa uns 100 nanosegundos, de forma previsível, mesmo com milhares de clientes ao mesmo tempo."*

---

### Slide 5 — Cache Aside: o fluxo
> *"Agora o padrão em si. No Cache Aside, a aplicação — não o cache, não o banco — é responsável por gerenciar o que entra e sai do cache."*

> *"Quando chega uma requisição de leitura, a API primeiro consulta o Redis. Se o dado está lá, isso é um CACHE HIT — retorna na hora, sem tocar no banco."*

> *"Se não está — CACHE MISS — a API busca no PostgreSQL, armazena o resultado no Redis com um tempo de expiração, e retorna para o cliente. Na próxima vez, já vai ser HIT."*

> *"Quando tem uma escrita — um PUT ou DELETE — a API atualiza o banco e imediatamente apaga a chave correspondente no Redis. Isso se chama invalidação. Na próxima leitura, o dado vai ser recarregado do banco já atualizado."*

> *"Isso é importante: o cache nunca fica com dado errado por conta de uma escrita nossa. A invalidação garante isso."*

---

## 🎤 PESSOA 3 — Arquitetura da Solução
**Slide 6 · ~4 minutos**

---

### Slide 6 — Arquitetura da Solução
> *"Aqui está a arquitetura completa, e como o padrão foi implementado de verdade."*

> *"O frontend é uma SPA servida pelo próprio NestJS. O backend é NestJS com Fastify, um adapter HTTP mais rápido que o Express."*

> *"O coração da implementação é um `CacheService` centralizado: todos os controllers passam por ele. Toda leitura tenta o cache primeiro; toda escrita invalida a chave afetada. Em vez de espalhar lógica de cache pelos controllers, fica tudo num único lugar."*

> *"Um detalhe que deixa o comportamento transparente: cada resposta da API inclui o header `X-Cache`, com o valor HIT, MISS, DISABLED ou WRITE. Qualquer cliente consegue ver exatamente o que aconteceu com aquela requisição."*

> *"As estatísticas — hits, misses, hit rate — são contadores no próprio Redis, atualizados com `HINCRBY`, sem custo adicional. Dá para consultar em tempo real no `GET /stats`. E implementamos um toggle de cache em runtime, o `POST /cache/toggle` — foi com ele que comparamos os cenários com e sem cache sem reiniciar a aplicação."*

> *"No Redis usamos uma chave por recurso: `products:all` para a listagem, `products:42` para o item de ID 42, e assim por diante. TTL de 5 minutos."*

> *"E para observabilidade, todo HIT, MISS e INVALIDATE é logado com uma tag estruturada. Esses logs vão para o Promtail, que manda para o Loki, que o Grafana exibe em tempo real. Isso permite ver, em produção, quantas vezes o banco está sendo consultado versus quantas o cache está respondendo."*

---

## 🎤 PESSOA 4 — Demonstração ao Vivo
**Slide 7 · ~4 minutos**

---

### Slide 7 — Demo
> *"Agora vou mostrar tudo funcionando ao vivo."*

**[Abre o browser em localhost:3000]**

> *"Esse é nosso frontend. Aqui em cima temos três botões: toggle de cache, reset de stats, e reset do Grafana."*

**[Clica em Produtos → Listar Todos]**
> *"Primeira chamada — olha o toast que aparece: X-Cache: MISS. O banco foi consultado, o resultado foi armazenado no Redis."*

**[Clica em Listar Todos novamente]**
> *"Segunda chamada — X-Cache: HIT. O Redis respondeu, o banco nem foi tocado."*

**[Clica em Reset Stats, depois Listar Todos 3 vezes]**
> *"Depois de alguns requests, olhem as estatísticas: hits, misses, hit rate em tempo real."*

**[Cria um novo produto]**
> *"Agora vou criar um produto novo. Olhem: X-Cache: WRITE. O banco foi atualizado e a chave `products:all` foi invalidada no Redis."*

**[Clica em Listar Todos]**
> *"Próxima listagem — MISS de novo, porque o cache foi invalidado. O dado novo está aqui."*

**[Abre localhost:3001 — Grafana]**
> *"E aqui no Grafana, dá para ver os HITs e MISSes ao longo do tempo, número de invalidações, e os logs estruturados em tempo real."*

**[Clica em Toggle Cache OFF]**
> *"Por último, vou desligar o cache. Próximas chamadas vão mostrar DISABLED — o banco é consultado em todas as requisições. Isso simula exatamente o cenário sem cache que medimos no load test."*

---

### Slide 7 (bônus) — Teste de carga AO VIVO  *(opcional, ~2 min)*

> *"E para não ficar só no slide, dá para ver o teste de carga acontecendo agora."*

**[No terminal, dentro de `backend/`, rodar:]**
```bash
make loadtest-live
```

> *"Esse comando usa o k6 para disparar uma rajada de centenas de requisições por segundo, primeiro SEM cache e depois COM cache, saturando o sistema de propósito."*

**[Deixar visível o painel de estatísticas do frontend (http://localhost:3000) — ele atualiza a cada 1 segundo. Opcionalmente, o Grafana (http://localhost:3001) ao lado.]**
> *"Olhem o painel de stats. Na primeira rajada, sem cache, os hits ficam em zero e as consultas ao banco disparam — o banco está sendo martelado. Agora, com o cache ligado, a taxa de HIT sobe para uns 90% em tempo real, e as consultas ao banco quase param de crescer."*

**[Ao final, o terminal imprime o comparativo lado a lado: latência mediana, p95, consultas ao banco e hit rate — SEM cache vs COM cache.]**

> *Observações para quem apresenta:*
> - *Durante cada rajada (~20s) o terminal fica quieto — a ação ao vivo está no navegador (painel de stats / Grafana). No fim o terminal mostra a tabela com os números.*
> - *Faça um `make loadtest-live` de aquecimento ANTES da apresentação: isso baixa a imagem do k6 e esquenta o banco, deixando os números do "pra valer" mais limpos.*
> - *É laptop + Docker, então os valores absolutos variam a cada run — o que importa é a diferença visível (hit rate ~90%, banco aliviado, latência menor sob carga), não o número exato.*
> - *Para uma rajada mais intensa: `RATE=150 PLATEAU=30s bash scripts/loadtest-live.sh`. Para a comparação longa e estável: `make loadtest` (3 min por cenário).*

---

## 🎤 PESSOA 5 — Métricas, Trade-offs e Conclusão
**Slides 8, 9, 10, 11, 12, 13 e 14 · ~4 minutos**

---

### Slide 8 — O preço do MISS (micro-benchmark)
> *"Antes dos números sob carga, vale olhar o custo de cada caminho num request isolado. Medimos 150 requisições por cenário, na página cheia de 200 produtos."*

> *"E aqui aparece um trade-off honesto: o CACHE MISS é o caminho mais caro — uns 8 milissegundos — porque ele faz duas coisas: consulta o banco E grava o resultado no Redis. Isso é cerca de 35% mais lento do que simplesmente ir direto ao banco, que deu 5,9 milissegundos."*

> *"Ou seja: popular o cache custa. Mas olhem o HIT: 3,7 milissegundos, quase 40% mais rápido que a query — porque lê direto da RAM, sem tocar no banco."*

> *"A tabela à direita mostra quando compensa. Para uma única leitura, sem cache é melhor. Mas já na segunda leitura idêntica o cache empata, e da terceira em diante a economia só cresce. Como em produção a mesma listagem é pedida centenas de vezes, o MISS inicial é irrelevante — o que domina é o HIT."*

> *"E é exatamente isso que o teste de carga confirma no próximo slide, quando esse efeito se multiplica por milhares de requisições simultâneas."*

---

### Slide 9 — Onde o cache ganha: protege o banco
> *"Para gerar estes números, usamos o **k6** — uma ferramenta de teste de carga. Ele simula centenas de usuários acessando a API em paralelo, gerando concorrência real, justamente para ver o cache trabalhando **sob saturação**. Rodamos o mesmo cenário com o cache ligado e desligado e comparamos."*

> *"O ganho mais sólido e que se repete em todo run é o alívio do banco: o hit rate ficou em torno de 90%, ou seja, 9 em cada 10 leituras nem chegam ao PostgreSQL. As consultas ao banco caíram cerca de 90% — de uns 12 mil para pouco mais de mil num run de 3 minutos."*

> *"E no servidor, uma leitura do cache custa cerca de 1 milissegundo, contra uns 10 milissegundos indo ao banco — umas 10 vezes mais rápido por leitura. Essa folga é o que vira tempo de fila economizado quando o tráfego cresce."*

---

### Slide 10 — Latência: o ganho aparece sob carga
> *"Aqui vem uma honestidade importante. Sem saturação, com o banco tranquilo, a latência com e sem cache é praticamente igual — uns 2,5 contra 3,2 milissegundos. Faz sentido: se o banco já responde rápido, o cache tem pouco o que melhorar na latência."*

> *"Mas quando a gente satura o sistema — cerca de 230 requisições por segundo — o quadro muda completamente. Sem cache, cada query enfrenta fila e a mediana sobe para uns 76 milissegundos; com cache, ela fica em torno de 3. O cache desvia 90% das leituras e a latência despenca."*

> *"Ou seja: o valor do cache é proporcional à pressão sobre o banco. Ele não multiplica a vazão — o throughput fica praticamente igual nos dois casos. O que ele faz é proteger o banco e estabilizar a latência justamente quando o tráfego aperta."*

---

### Slide 11 — Trade-offs
> *"Mas cache não é bala de prata. Toda decisão arquitetural tem trade-offs, e o professor pede que a gente discuta isso."*

> *"Primeiro: consistência eventual. Com TTL de 5 minutos, um usuário pode ver um dado com até 5 minutos de atraso. Mitigamos com invalidação explícita em toda escrita."*

> *"Segundo: cache stampede. Se muitas requisições chegam exatamente quando uma chave expira, todas vão ao banco ao mesmo tempo. Em sistemas de alta escala, isso exige TTL com jitter ou lock de recomputação."*

> *"Terceiro: cold start. Na inicialização, o cache está vazio. As primeiras requisições são mais lentas. Em produção, isso se resolve com warm-up ou cache persistente."*

> *"Para dados que precisam de consistência forte — saldo bancário, estoque em e-commerce — o cache-aside puro pode não ser suficiente. Nesses casos, padrões como write-through ou read-through são mais adequados."*

---

### Slides 12, 13 e 14 — Observabilidade e Conclusão
> *"Nossa stack de observabilidade completa: NestJS loga para arquivo, Promtail lê e faz parse dos logs, manda para Loki, e o Grafana exibe em tempo real. Isso nos deu visibilidade total do comportamento do cache sem nenhum instrumento adicional no código."*

> *"Resumindo: o Cache Aside não é só uma otimização de performance. É uma decisão arquitetural que afeta consistência, escalabilidade, operação e observabilidade. A gente demonstrou isso com dados reais medidos no nosso stack: menos 90% de consultas ao banco, hit rate de ~90%, e leitura do cache em ~1 ms contra ~10 ms no banco. E uma lição honesta: o ganho de latência aparece sob carga, quando o banco é o gargalo — não com o banco ocioso."*

> *"A lição principal é que cache é eficaz porque explora a hierarquia de memória — a RAM é fundamentalmente mais rápida que o disco — e porque o Redis, pela arquitetura dele, remove SQL, locks e disco do caminho. E o padrão Cache Aside dá controle total à aplicação sobre o que entra, o que sai, e quando o dado é invalidado."*

> *"Obrigado. Ficamos à disposição para perguntas."*

---

## Perguntas Prováveis

**"Por que Cache Aside e não Write-Through?"**
> No write-through, toda escrita atualiza banco e cache simultaneamente. Cache-aside é mais simples e suficiente para nosso cenário, onde leituras são muito mais frequentes que escritas.

**"O que acontece se o Redis cair?"**
> Nosso `CacheService` tem tratamento de erro: se o Redis retornar erro na leitura, a requisição passa direto para o banco com status `ERROR`. O sistema degrada graciosamente sem parar.

**"Se o Redis é single-thread, ele não vira gargalo?"**
> Na prática, não. O trabalho do Redis é dominado por I/O e por operações de memória em tempo constante, não por CPU — então uma thread atende centenas de milhares de operações por segundo. O modelo single-thread é justamente o que elimina locks e contenção. Quando a carga passa do limite de um core, escala-se horizontalmente (Redis Cluster) ou com réplicas de leitura.

**"~90% de hit rate é bom?"**
> Depende do padrão de acesso. Em nosso teste, com muitos usuários acessando as mesmas listagens, ~90% é esperado e ótimo. Em produção com dados mais diversificados, a hit rate pode ser menor — e é por isso que medimos: a hit rate diz exatamente quanto o cache está realmente economizando do banco.

**"Por que NestJS e não Express puro?"**
> NestJS com Fastify oferece injeção de dependência, módulos e decorators nativos. O `CacheService` é injetado em todos os controllers automaticamente — muito mais limpo que instanciação manual. E Fastify tem throughput ~20-30% maior que Express.

**"Qual o custo de memória do Redis?"**
> Nossos 20.000 pedidos com itens aninhados ocupam algumas dezenas de MB no Redis. Para escalar, dá para configurar política de eviction (LRU) e limitar o tamanho máximo do cache.
