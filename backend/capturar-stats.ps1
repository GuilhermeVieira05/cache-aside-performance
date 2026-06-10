# Captura os contadores de cache (hits, misses, invalidações, consultas ao banco)
# para os dois cenários sem precisar refazer o teste de latência completo.
# Leva ~1-2 minutos. Salva em backend/k6/results/cache-stats-<label>.json.
#
# Uso:  ./capturar-stats.ps1
#       ./capturar-stats.ps1 -Journeys 300

param(
  [int]$Journeys  = 200,
  [double]$BuyProb = 0.25
)

$ErrorActionPreference = 'Stop'
$compose = @('compose', '-f', 'docker-compose.yml')
$base    = 'http://localhost:3000'
$results = Join-Path $PSScriptRoot 'k6\results'

function Wait-Health {
  Write-Host '  Aguardando API...' -ForegroundColor Cyan
  for ($i = 0; $i -lt 120; $i++) {
    try {
      if ((Invoke-WebRequest -UseBasicParsing "$base/up" -TimeoutSec 5).StatusCode -eq 200) {
        Write-Host '  API pronta.' -ForegroundColor Green; return
      }
    } catch {}
    Start-Sleep -Seconds 2
  }
  throw 'API nao respondeu em /up apos 240s.'
}

function Invoke-StatsCapture {
  param([string]$Label, [string]$Cache)

  Write-Host "`n===== Capturando stats: $Label  (CACHE_ENABLED=$Cache) =====" -ForegroundColor Yellow

  # 1) Recria web com o cenario correto
  $env:CACHE_ENABLED    = $Cache
  $env:LOAD_TEST_MODE   = 'true'
  $env:RAILS_MAX_THREADS = '5'
  docker @compose up -d --force-recreate web | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "up web falhou ($Label)" }

  # 2) Cache frio + reset contadores
  docker @compose exec -T redis redis-cli FLUSHALL | Out-Null
  Wait-Health
  Invoke-RestMethod -Method Post -Uri "$base/stats/reset" | Out-Null
  Write-Host '  Contadores zerados.' -ForegroundColor Cyan

  # 3) Carga leve espelhando a jornada real
  Write-Host "  Gerando $Journeys jornadas..." -ForegroundColor Cyan
  $products  = (Invoke-RestMethod "$base/products")  | ForEach-Object { $_.id }
  $customers = (Invoke-RestMethod "$base/customers") | ForEach-Object { $_.id }

  if ($products.Count -eq 0 -or $customers.Count -eq 0) {
    throw "Banco vazio - rode o seed antes: docker compose run --rm web ./bin/rails runner db/seed_load.rb"
  }

  $rng = [System.Random]::new()

  for ($j = 0; $j -lt $Journeys; $j++) {
    # GET /products  (catalogo)
    Invoke-RestMethod "$base/products" | Out-Null

    # GET /products/:id  (1 ou 2 produtos)
    $picks = $rng.Next(1, 3)
    for ($p = 0; $p -lt $picks; $p++) {
      $prodId = $products[$rng.Next(0, $products.Count)]
      Invoke-RestMethod "$base/products/$prodId" | Out-Null
    }

    # GET /orders
    Invoke-RestMethod "$base/orders" | Out-Null

    # POST /orders  (25% das jornadas compram)
    if ($rng.NextDouble() -lt $BuyProb) {
      $prodId = $products[$rng.Next(0, $products.Count)]
      $cid = $customers[$rng.Next(0, $customers.Count)]
      $body = @{
        order = @{
          customer_id = $cid
          status      = 'pending'
          order_items_attributes = @(@{ product_id = $prodId; quantity = 1 })
        }
      } | ConvertTo-Json -Depth 5
      try {
        Invoke-RestMethod -Method Post -Uri "$base/orders" -ContentType 'application/json' -Body $body | Out-Null
      } catch { <# ignora validacao #> }
    }

    if (($j + 1) % 50 -eq 0) { Write-Host "  $($j+1) / $Journeys jornadas" }
  }

  # 4) Lê e salva os contadores
  $stats = Invoke-RestMethod "$base/stats"
  $stats | Add-Member -NotePropertyName label       -NotePropertyValue $Label
  $stats | Add-Member -NotePropertyName journeys    -NotePropertyValue $Journeys
  $stats | Add-Member -NotePropertyName captured_at -NotePropertyValue (Get-Date -Format 'o')

  $outFile = Join-Path $results "cache-stats-$Label.json"
  $stats | ConvertTo-Json | Set-Content -Encoding utf8 $outFile
  Write-Host "  Salvo em: $outFile" -ForegroundColor Green
  Write-Host ("  hits={0}  misses={1}  hit_rate={2}%  db_queries={3}  invalidations={4}" -f `
    $stats.hits, $stats.misses, $stats.hit_rate, $stats.db_queries, $stats.invalidations)
}

# Garante que a pasta de resultados existe
if (-not (Test-Path $results)) { New-Item -ItemType Directory -Path $results | Out-Null }

Invoke-StatsCapture -Label 'cache-off' -Cache 'false'
Invoke-StatsCapture -Label 'cache-on'  -Cache 'true'

# Volta o web ao estado padrao
$env:CACHE_ENABLED  = 'true'
$env:LOAD_TEST_MODE = 'false'
docker @compose up -d --force-recreate web | Out-Null

Write-Host "`nCaptura concluida. Abra http://localhost:8080/report/ para ver as metricas de cache." -ForegroundColor Green
