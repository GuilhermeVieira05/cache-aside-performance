#!/usr/bin/env bash
# Teste de carga AO VIVO para a apresentação.
# Roda uma rajada curta saturando a API, primeiro SEM cache e depois COM cache,
# resetando as estatísticas entre as duas, e imprime um comparativo.
# Enquanto roda, abra o Grafana (http://localhost:3001) para ver os gráficos ao vivo.
#
# Uso:  make loadtest-live        (de dentro de backend/)
#   ou:  bash scripts/loadtest-live.sh
# Ajuste a intensidade/duração:  RATE=150 PLATEAU=30s bash scripts/loadtest-live.sh
set -euo pipefail
cd "$(dirname "$0")/.."
API=${API:-http://localhost:3000}
RATE=${RATE:-120}; PLATEAU=${PLATEAU:-20s}; RAMP=${RAMP:-5s}

cstate(){ curl -s "$API/cache/status" | python3 -c "import sys,json;print(str(json.load(sys.stdin)['enabled']).lower())"; }
setc(){ [ "$(cstate)" != "$1" ] && curl -s -X POST "$API/cache/toggle" >/dev/null || true; }
val(){ python3 -c "import sys,json;print(json.load(sys.stdin).get('$1','-'))"; }

burst(){ # $1 label  $2 cachebool   -> imprime "med|p95|db_queries|hit_rate"
  setc "$2"; curl -s -X POST "$API/stats/reset" >/dev/null
  echo ">>> Rodando '$1' (cache=$2) — observe o Grafana em http://localhost:3001 ..." >&2
  local out med p95 stats
  out=$(docker compose --profile loadtest run --rm -T k6 run \
        -e LABEL="$1" -e RATE="$RATE" -e RAMP="$RAMP" -e PLATEAU="$PLATEAU" \
        /scripts/buy-flow.js 2>/dev/null | grep -E '^\[' || true)
  med=$(echo "$out" | sed -E 's/.*med=([0-9.]+)ms.*/\1/'); med=${med:-?}
  p95=$(echo "$out" | sed -E 's/.*p95=([0-9.]+)ms.*/\1/'); p95=${p95:-?}
  stats=$(curl -s "$API/stats")
  echo "$med|$p95|$(echo "$stats" | val db_queries)|$(echo "$stats" | val hit_rate)"
}

echo "================ TESTE DE CARGA AO VIVO ================"
echo "  RATE=$RATE  platô=$PLATEAU  (Ctrl-C cancela)"
OFF=$(burst live-off false)
ON=$(burst  live-on  true)
setc false   # restaura cache desligado

IFS='|' read -r m1 p1 db1 hr1 <<<"$OFF"
IFS='|' read -r m2 p2 db2 hr2 <<<"$ON"
printf '\n%-18s %12s %12s\n' "" "SEM cache" "COM cache"
printf '%-18s %12s %12s\n'  "Latência mediana" "${m1} ms" "${m2} ms"
printf '%-18s %12s %12s\n'  "Latência p95"      "${p1} ms" "${p2} ms"
printf '%-18s %12s %12s\n'  "Consultas ao banco" "$db1" "$db2"
printf '%-18s %12s %12s\n'  "Hit rate"           "${hr1}%" "${hr2}%"
echo "======================================================="
