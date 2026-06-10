# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Rails 7.2 API-only application demonstrating the **cache-aside pattern** for performance benchmarking. It exposes REST endpoints for customers, products, and orders, backed by PostgreSQL, with Redis as the cache layer. The full stack runs via Docker Compose including observability services (Grafana, Loki, Promtail).

## Commands

All commands run from the `backend/` directory.

### Start / stop the stack

```bash
make start    # build images, create/migrate DB, tail logs
make stop     # docker-compose down
make reset    # destroy volumes and start fresh
```

### During development

```bash
make logs     # tail Rails logs
make console  # rails console inside container
make migrate  # run pending migrations
```

### Tests, lint, security scan

```bash
# Run all tests (requires Postgres running)
docker-compose run --rm web bin/rails db:test:prepare test test:system

# Lint
docker-compose run --rm web bin/rubocop -f github

# Security scan
docker-compose run --rm web bin/brakeman --no-pager
```

### Seed data

```bash
docker-compose run --rm web bin/rails db:seed
```

Seeds 100 customers, 30 products, and ~300 orders with order items.

## Architecture

### Cache-aside pattern (`app/services/cache_service.rb`)

`CacheService` is the single entry point for all caching. It wraps `Rails.cache` (Redis store in development/production) with three methods:

- `CacheService.fetch(key) { ... }` — read-through: returns cached value or executes block, caches result, logs HIT/MISS
- `CacheService.invalidate(*keys)` — deletes keys and logs INVALIDATE
- `CacheService.enabled?` — controlled by `CACHE_ENABLED` env var (default `true`)

All controllers follow the same pattern: cache on reads, invalidate on writes/deletes.

### Cache keys

| Resource | List key | Record key |
|----------|----------|------------|
| Customers | `customers:all` | `customers:<id>` |
| Products | `products:all` | `products:<id>` |
| Orders | `orders:all` | `orders:<id>` |

Orders cache includes nested `order_items` via `as_json(include: ...)`.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CACHE_ENABLED` | `true` | Toggle cache-aside on/off (use `false` for baseline benchmarks) |
| `CACHE_TTL_SECONDS` | `300` | Redis key TTL |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection |
| `DATABASE_URL` | set in docker-compose | Postgres connection |

### Observability stack

- **Rails logs** → mounted volume → **Promtail** → **Loki** (`:3200`) → **Grafana** (`:3001`, admin/admin)
- Grafana dashboard (`observability/grafana/provisioning/dashboards/cache_dashboard.json`) visualizes cache hit/miss/invalidate log lines and response times
- Log patterns parsed by Promtail: `[CACHE HIT]`, `[CACHE MISS]`, `[CACHE INVALIDATE]`

### Data model

```
Customer ──< Order ──< OrderItem >── Product
```

`Order` has an enum `status` (pending/processing/shipped/delivered/cancelled) and a `recalculate_total!` method that sums `quantity * unit_price` across its items. Order creation is wrapped in a transaction.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs three jobs on every PR and push to `main`:

1. `scan_ruby` — Brakeman static security analysis
2. `lint` — RuboCop with `rubocop-rails-omakase`
3. `test` — Rails test suite against a real Postgres service container (Redis is commented out in CI — tests run with `CACHE_ENABLED=false` implied by missing `REDIS_URL`)
