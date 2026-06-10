# Demonstra o impacto da invalidacao do cache com numeros exatos.
# Mostra: MISS (frio) -> HIT (cache quente) -> escrita invalida -> MISS (frio de novo).
#
# Pre-requisito: stack no ar (make start) com CACHE_ENABLED=true (default).
# Uso:  ./demo-invalidacao.ps1

$ErrorActionPreference = 'Stop'
$base    = 'http://localhost:3000'
$compose = @('compose', '-f', 'docker-compose.yml')

function Measure-Url($url) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  Invoke-RestMethod $url | Out-Null
  $sw.Stop()
  [math]::Round($sw.Elapsed.TotalMilliseconds, 0)
}

function Get-Stats { Invoke-RestMethod "$base/stats" }

function Show-Stats($label, $stats) {
  Write-Host ("  {0,-38} hits={1,4}  misses={2,4}  db_queries={3,4}  invalidations={4,3}" -f `
    $label, $stats.hits, $stats.misses, $stats.db_queries, $stats.invalidations)
}

# Pega produto para usar no PUT (invalidar)
$prod = Invoke-RestMethod "$base/products" | ForEach-Object { $_ } | Select-Object -First 1
if (-not $prod) { throw "Nenhum produto encontrado - rode o seed primeiro." }
$prodId1 = $prod.id

Write-Host "`n===============================" -ForegroundColor Cyan
Write-Host "  Demo: impacto da invalidacao" -ForegroundColor Cyan
Write-Host "  Endpoint: GET /products (lista completa)" -ForegroundColor Cyan
Write-Host "  Invalidacao via: PATCH /products/$prodId1" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan

# 0) Cache frio + contadores zerados
Write-Host "`n[0] Limpando cache Redis e zerando contadores..." -ForegroundColor DarkGray
docker @compose exec -T redis redis-cli FLUSHALL | Out-Null
Invoke-RestMethod -Method Post -Uri "$base/stats/reset" | Out-Null
Write-Host "    Pronto.`n" -ForegroundColor DarkGray

# 1) 1a leitura - MISS (cache frio)
$ms1 = Measure-Url "$base/products"
$s1  = Get-Stats
Write-Host "[1] GET /products  ->  MISS  ($ms1 ms)  <- banco consultado, resposta cacheada"
Show-Stats "apos 1a leitura (esperado: MISS)" $s1

# 2) 2a leitura - HIT (cache quente)
$ms2 = Measure-Url "$base/products"
$s2  = Get-Stats
Write-Host "`n[2] GET /products  ->  HIT   ($ms2 ms)  <- Redis, banco NAO consultado"
Show-Stats "apos 2a leitura (esperado: HIT)" $s2

# 3) Escrita -> invalida products:all
$body = (@{
  product = @{
    name          = [string]$prod.name
    price         = [double]$prod.price
    stock_quantity = [int]$prod.stock_quantity
  }
} | ConvertTo-Json -Depth 4)
Invoke-RestMethod -Method Patch -Uri "$base/products/$prodId1" -ContentType 'application/json' -Body $body | Out-Null
$s3 = Get-Stats
Write-Host "`n[3] PATCH /products/$prodId1  ->  chave 'products:all' invalidada"
Show-Stats "apos escrita (invalida)" $s3

# 4) 3a leitura - MISS (cache invalidado)
$ms4 = Measure-Url "$base/products"
$s4  = Get-Stats
Write-Host "`n[4] GET /products  ->  MISS  ($ms4 ms)  <- banco de novo, cache re-populado"
Show-Stats "apos 3a leitura (esperado: MISS)" $s4

# 5) Tabela resumo
Write-Host "`n---------------------------------------------------" -ForegroundColor Yellow
Write-Host "  Resumo da demonstracao" -ForegroundColor Yellow
Write-Host "---------------------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Host ("  {0,-12} {1,-10} {2,-10} {3}" -f "Passo","Latencia","Resultado","Observacao")
Write-Host ("  {0,-12} {1,-10} {2,-10} {3}" -f "------","--------","----------","-----------")
Write-Host ("  {0,-12} {1,-10} {2,-10} {3}" -f "[1] 1a GET","${ms1}ms","MISS","banco consultado, lista cacheada")
Write-Host ("  {0,-12} {1,-10} {2,-10} {3}" -f "[2] 2a GET","${ms2}ms","HIT","Redis - banco NAO consultado")
Write-Host ("  {0,-12} {1,-10} {2,-10} {3}" -f "[3] PATCH","","invalida","products:all removido do Redis")
Write-Host ("  {0,-12} {1,-10} {2,-10} {3}" -f "[4] 3a GET","${ms4}ms","MISS","banco de novo, lista re-cacheada")
Write-Host ""
Write-Host ("  Contadores finais:  hits={0}  misses={1}  hit_rate={2}%  db_queries={3}  invalidations={4}" -f `
  $s4.hits, $s4.misses, $s4.hit_rate, $s4.db_queries, $s4.invalidations)
Write-Host ""
if ($ms1 -gt 0 -and $ms2 -gt 0) {
  $speedup = [math]::Round($ms1 / [math]::Max($ms2, 1), 1)
  Write-Host ("  Ganho HIT vs MISS: {0}ms -> {1}ms  ({2}x mais rapido com cache)" -f $ms1, $ms2, $speedup)
}
Write-Host "---------------------------------------------------" -ForegroundColor Yellow
