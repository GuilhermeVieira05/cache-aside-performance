# Roda o comparativo cache-on vs cache-off de ponta a ponta (tudo via Docker).
# Uso:  ./run-comparison.ps1
#       ./run-comparison.ps1 -Rate 40 -Orders 2000 -Products 500 -Customers 300
#
# Para cada cenário: re-semeia o banco (dataset idêntico, em massa), recria o web em
# modo de teste de carga (sem overhead de dev) com a flag de cache, limpa o Redis,
# espera a API e dispara o k6. Ao final, sobe a interface comparativa.

param(
  [int]$Rate = 40,
  [double]$BuyProb = 0.25,
  [int]$Orders = 2000,
  [int]$Products = 500,
  [int]$Customers = 300,
  [int]$Threads = 5
)

$ErrorActionPreference = 'Stop'
$compose = @('compose', '-f', 'docker-compose.yml')

function Wait-Health {
  Write-Host 'Aguardando API em /up...' -ForegroundColor Cyan
  for ($i = 0; $i -lt 90; $i++) {
    try {
      if ((Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/up' -TimeoutSec 3).StatusCode -eq 200) {
        Write-Host 'API pronta.' -ForegroundColor Green; return
      }
    } catch { Start-Sleep -Seconds 1 }
  }
  throw 'API nao respondeu em /up apos 90s.'
}

function Invoke-Scenario {
  param([string]$Label, [string]$Cache)

  Write-Host "`n===== Cenario: $Label  (CACHE_ENABLED=$Cache) =====" -ForegroundColor Yellow

  # 1) Dataset identico (seed pesado em massa) no inicio de cada run
  docker @compose run --rm -e ORDERS=$Orders -e PRODUCTS=$Products -e CUSTOMERS=$Customers `
    web ./bin/rails runner db/seed_load.rb
  if ($LASTEXITCODE -ne 0) { throw "seed falhou ($Label)" }

  # 2) Recria o web em modo de teste de carga com a flag desejada
  $env:CACHE_ENABLED = $Cache
  $env:LOAD_TEST_MODE = 'true'
  $env:RAILS_MAX_THREADS = "$Threads"
  docker @compose up -d --force-recreate web
  if ($LASTEXITCODE -ne 0) { throw "up web falhou ($Label)" }

  # 3) Cache frio
  docker @compose exec -T redis redis-cli FLUSHALL | Out-Null

  # 4) Espera a API e dispara o k6
  Wait-Health
  docker @compose run --rm `
    -e LABEL=$Label -e RATE=$Rate -e BUY_PROB=$BuyProb `
    k6 run --quiet --out json=/results/raw-$Label.json /scripts/buy-flow.js
  if ($LASTEXITCODE -ne 0) { Write-Host "k6 saiu com $LASTEXITCODE (thresholds podem ter falhado - normal sem cache)" -ForegroundColor DarkYellow }
}

Invoke-Scenario -Label 'cache-off' -Cache 'false'
Invoke-Scenario -Label 'cache-on'  -Cache 'true'

# Deixa o web no estado padrao (cache ligado) e sobe a interface.
$env:CACHE_ENABLED = 'true'
docker @compose up -d --force-recreate web | Out-Null
docker @compose up -d report | Out-Null

Write-Host "`nComparativo pronto -> http://localhost:8080/report/" -ForegroundColor Green
