start:
	docker-compose up --build -d
	docker-compose run --rm web rails db:create db:migrate
	docker-compose logs -f web

stop:
	docker-compose down

restart:
	docker-compose restart web

logs:
	docker-compose logs -f web

console:
	docker-compose run --rm web rails console

migrate:
	docker-compose run --rm web rails db:migrate

seed:
	docker-compose run --rm web rails db:seed

reset-loki:
	docker-compose stop loki promtail
	docker volume rm backend_loki_data backend_rails_logs 2>/dev/null || true
	docker-compose up -d loki promtail
	@echo "Loki resetado. Dados anteriores apagados."

reset:
	docker-compose down -v
	docker-compose up --build -d
	docker-compose run --rm web rails db:create db:migrate

# Roda o comparativo de carga cache-on vs cache-off e sobe a interface (:8080)
bench:
	pwsh ./run-comparison.ps1

# Sobe apenas a interface comparativa com os resultados ja existentes
report:
	docker-compose up -d report
	@echo "Interface: http://localhost:8080/report/"
