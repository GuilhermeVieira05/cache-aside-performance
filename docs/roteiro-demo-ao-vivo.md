# Roteiro da Demonstração ao Vivo — Cache Aside

> **Para quem vai apresentar a demo.** Tudo que você mostra, na ordem, os comandos de cada passo, o que falar nos momentos-chave e como sair de qualquer erro na hora.

Todos os comandos rodam de dentro da pasta `backend/`.

Endereços que você vai usar:
- **Painel (frontend):** http://localhost:3000
- **Grafana:** http://localhost:3001 — login `admin` / `admin`
- **`/stats` cru (prova anti-mock):** http://localhost:3000/stats

---

## 0. ANTES de apresentar (checklist de 2 minutos)

Faça isso **antes** da plateia chegar, com calma:

1. **Suba a stack:**
   ```bash
   make start
   ```
   Isso builda e sobe tudo em background e começa a seguir os logs do `web`. Quando ver `Application running on port 3000`, aperte `Ctrl-C` (isso só para de *seguir* o log — os containers continuam de pé).

2. **Confirme que tem dados** (abra o painel e clique em Produtos → Listar). Se a lista vier vazia, rode o seed:
   ```bash
   make seed
   ```
   Ao final deve aparecer: `Clientes: 10000 / Produtos: 1000 / Pedidos: 50000`.

3. **Abra as duas abas no navegador:**
   - http://localhost:3000 (painel)
   - http://localhost:3001 (Grafana → abra o dashboard "Cache Aside — Performance Dashboard")

4. **No Grafana, ajuste a janela de tempo** (canto superior direito) para **"Last 15 minutes"** e ligue o auto-refresh em **5s**.

5. **Deixe um terminal visível** ao lado, na pasta `backend/`, pronto pra rodar comandos.

> Pronto. Se tudo isso funcionou, a demo vai fluir.

---

## 1. ROTEIRO PASSO A PASSO

### Passo 1 — Zerar e mostrar o painel
**Faça:** No painel (localhost:3000), clique em **Reset Stats**.
**Fale:** *"Esse painel mostra, em tempo real, métricas que o servidor calcula sozinho. Acabei de zerar tudo — todos os contadores estão em branco. Tudo que vocês virem daqui pra frente é resultado real das requisições que eu fizer."*

### Passo 2 — Primeira leitura: CACHE MISS
**Faça:** Clique em **Produtos → Listar** (1ª vez).
**Olhe/aponte:** o toast mostra `X-Cache: MISS`; no painel sobem **Misses**, **Consultas ao banco** e o bloco **🟡 Tempo médio MISS**.
**Fale:** *"Primeira vez que peço essa página: o cache não tem o dado — é um MISS. O servidor foi ao banco, trouxe o resultado e guardou no Redis. Reparem que o tempo do MISS é o maior de todos: ele paga o banco mais o custo de gravar no cache."*

### Passo 3 — Segunda leitura: CACHE HIT
**Faça:** Clique em **Listar** de novo (mesma página).
**Olhe/aponte:** `X-Cache: HIT`; sobe **Hits**, **Hit rate**, e o bloco **🟢 Tempo médio HIT** (vai ser uma fração de ms).
**Fale:** *"Mesma requisição, segunda vez: HIT. O Redis respondeu direto da memória, o banco nem foi tocado. Olhem a diferença de tempo — o HIT é dezenas de vezes mais rápido que o MISS."*

### Passo 4 — Provar que não é mockado
**Faça (terminal):**
```bash
curl -s localhost:3000/stats | python3 -m json.tool
```
**Fale:** *"Pra provar que isso não é número inventado no front: esse é o endpoint cru do servidor. Os números batem exatamente com o que está na tela — porque o front só desenha o que o backend mediu."*

### Passo 5 — Desligar o cache: SQL sem cache
**Faça:** Clique em **Toggle Cache** (fica OFF). Depois **Produtos → Listar** (outra página, ex. página 2).
**Olhe/aponte:** `X-Cache: DISABLED`; sobe o bloco **🔴 Tempo médio SQL sem cache**.
**Fale:** *"Agora desliguei o cache. Toda requisição vai direto ao banco — isso simula o sistema sem cache nenhum. Esse é o tempo do SQL puro."*
**Faça:** Clique em **Toggle Cache** de novo pra religar (ON).

### Passo 6 — Impacto da invalidação
**Faça:** Crie um produto novo (formulário de Produtos → Criar). Depois **Listar** a página 1.
**Olhe/aponte:** ao criar, `X-Cache: WRITE` e **Invalidações** sobe; ao listar de novo, volta a dar `MISS`.
**Fale:** *"Quando eu escrevo — crio um produto — o servidor invalida as páginas de produto no cache. Por isso a próxima leitura volta a ser MISS: o cache foi limpo pra não servir dado velho. É assim que garantimos consistência depois de uma escrita."*

### Passo 7 — Grafana (testemunha independente)
**Faça:** Vá para a aba do Grafana.
**Aponte:**
- Painel **"Cache Hits vs Misses ao longo do tempo"**.
- Painel **"Tempo médio de resposta por tipo (HIT / MISS / SQL sem cache)"** — as três linhas separadas.
- Painel **"Logs de Cache em tempo real"**.
**Fale:** *"O painel do front lê contadores do Redis. O Grafana lê de um caminho totalmente diferente: os logs da aplicação, via Loki. Os dois mostram o mesmo comportamento — então não tem como ser maquiado. E aqui dá pra ver o tempo médio separado por HIT, MISS e SQL sem cache ao longo do tempo."*

> ⚠️ Os números absolutos do Grafana e do `/stats` **não** são iguais — e está certo: o `/stats` zera quando você dá Reset; o Grafana soma todos os logs da janela de tempo escolhida. Um é "desta rodada", o outro é "histórico na janela". Se alguém perguntar, é esse o motivo.

### Passo 8 — Teste de carga ao vivo (o número que impressiona)
**Faça (terminal):**
```bash
make loadtest-live
```
**Fale enquanto roda (~1 min):** *"Agora um teste de carga real: o k6 satura a API, primeiro sem cache e depois com cache. Olhem o Grafana se mexendo ao vivo."*
**Ao terminar, leia a tabela:** latência mediana e p95 despencam com cache, e o número de consultas ao banco cai pela metade mesmo atendendo mais tráfego.
**Ponto forte pra fechar:** *"Reparem uma coisa interessante: sob carga, o 'sem cache' fica mais lento até que o MISS. Por quê? Porque sem cache TODA requisição vai ao banco e ele satura. Com cache, só uma fração chega ao banco, então ele fica folgado e até os MISS ficam rápidos. O cache não acelera só a leitura — ele protege o banco da sobrecarga."*

---

## 2. COMANDOS DE EMERGÊNCIA (se algo der errado na hora)

| Sintoma | Causa | Como resolver na hora |
|---|---|---|
| **Listagem vem vazia / sem dados** | Banco sem seed (ou rodou `make reset`) | `make seed` (≈1–2 min). Se o `web` não estiver de pé: `docker compose run --rm web node scripts/seed.js` |
| **Painel não abre (localhost:3000 não responde)** | `web` não está rodando | `docker compose up -d web` e aguarde ~10s. Veja o status: `docker compose ps web` |
| **`web` aparece como "Created" e não sobe** | Container num estado ruim / porta presa | `docker compose up -d --force-recreate web` |
| **Log do `web` com `EAI_AGAIN db`/`redis`** | `web` subiu antes de db/redis ficarem prontos | Aguarde db/redis ficarem `healthy` (`docker compose ps`) e rode `docker compose up -d --force-recreate web` |
| **`Bind for 0.0.0.0:3000 failed: port is already allocated`** | Outra coisa está usando a porta 3000 | Descubra quem: `lsof -nP -iTCP:3000 -sTCP:LISTEN`. Se for outro container Docker: `docker stop <nome>`. Depois `docker compose up -d --force-recreate web` |
| **`make loadtest-live` cospe erros de JSON e tabela com `0.0 ms`** | App não está na porta 3000 (o script assume `localhost:3000`) | Garanta que o app está na 3000 (`curl localhost:3000/stats` tem que devolver JSON). Se estiver em outra porta: `API=http://localhost:3005 make loadtest-live` |
| **Grafana sem dados / painéis vazios** | Janela de tempo errada, ou atraso do Loki | No canto sup. direito do Grafana, selecione **"Last 15 minutes"**. O Loki tem alguns segundos de atraso — espere ~10s e atualize |
| **`/stats` e Grafana com números diferentes** | Não é erro — fontes diferentes | `/stats` = contador do Redis (zera no Reset). Grafana = contagem de logs na janela de tempo (não zera). Explique isso à plateia |
| **Esqueci de zerar e os números estão "sujos"** | Stats acumuladas de testes anteriores | Clique **Reset Stats** no painel (ou `curl -s -X POST localhost:3000/stats/reset`) |
| **Quero recomeçar do absoluto zero** | — | `make reset` apaga TUDO (volumes) e sobe limpo. **Depois você PRECISA rodar `make seed` de novo.** Use só se tiver tempo |

### Comandos úteis de bolso
```bash
docker compose ps                 # quem está de pé e saudável
docker compose logs web | tail    # últimos logs do app
curl -s localhost:3000/stats | python3 -m json.tool   # métricas cruas
curl -s localhost:3000/cache/status                   # cache ligado ou não
curl -s -X POST localhost:3000/cache/toggle           # liga/desliga cache
curl -s -X POST localhost:3000/stats/reset            # zera as métricas
```

---

## 3. SEQUÊNCIA DE SEGURANÇA (se quiser ensaiar antes do zero)

```bash
make start          # sobe a stack (Ctrl-C quando aparecer "running on port 3000")
make seed           # popula 10k/1k/50k  (uma vez só; os dados persistem)
# abrir localhost:3000 e localhost:3001, conferir que tudo responde
# ensaiar os passos 1 a 8 acima
```

Os dados ficam salvos no volume do Postgres — você **não** precisa re-seedar a cada `make start`. Só precisa re-seedar depois de um `make reset`.

---

## 4. Resumo dos 8 passos (cola rápida)

1. **Reset Stats** — zera o painel
2. **Listar produtos** → MISS (tempo alto)
3. **Listar de novo** → HIT (tempo baixíssimo)
4. **`curl /stats`** → prova que é real
5. **Toggle OFF + listar** → SQL sem cache
6. **Criar produto + listar** → invalidação (volta a MISS)
7. **Grafana** → testemunha independente + tempos por tipo
8. **`make loadtest-live`** → números sob carga + fala do "cache protege o banco"
