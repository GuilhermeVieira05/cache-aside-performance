#!/usr/bin/env bash
# Comparativo completo de carga (k6): roda o cenário COM cache e SEM cache,
# alternando o cache via API em runtime e resetando as estatísticas entre os runs
# (o app lê o estado do cache em runtime — definir CACHE_ENABLED no container do k6
#  não teria efeito sobre o web).
#
# Uso:  make loadtest        (de dentro de backend/)
# Ajuste:  RATE=80 PLATEAU=120s bash scripts/loadtest.sh
set -euo pipefail
cd "$(dirname "$0")/.."
API=${API:-http://localhost:3000}
RATE=${RATE:-80}; PLATEAU=${PLATEAU:-120s}; RAMP=${RAMP:-30s}

cstate(){ curl -s "$API/cache/status" | python3 -c "import sys,json;print(str(json.load(sys.stdin)['enabled']).lower())"; }
setc(){ [ "$(cstate)" != "$1" ] && curl -s -X POST "$API/cache/toggle" >/dev/null || true; echo "  cache=$(cstate)"; }

run(){ # $1 label  $2 cachebool
  echo "===== $1 (cache=$2, RATE=$RATE, platô=$PLATEAU) ====="
  setc "$2"
  curl -s -X POST "$API/stats/reset" >/dev/null
  docker compose --profile loadtest run --rm -T k6 run \
    -e LABEL="$1" -e RATE="$RATE" -e RAMP="$RAMP" -e PLATEAU="$PLATEAU" /scripts/buy-flow.js
  curl -s "$API/stats" > "k6/results/cache-stats-$1.json"
  echo "  stats -> k6/results/cache-stats-$1.json"
}

run cache-on  true
run cache-off false
setc false
echo "Resultados em k6/results/ — relatório em http://localhost:8080/report/ (suba o serviço 'report')"
