.PHONY: start stop logs seed reset loadtest

start:
	docker-compose up --build -d && docker-compose logs -f web

stop:
	docker-compose down

reset:
	docker-compose down -v && docker-compose up --build -d && docker-compose logs -f web

logs:
	docker-compose logs -f web

seed:
	docker-compose exec web node scripts/seed.js

loadtest:
	@echo "Rodando com cache ON..."
	CACHE_ENABLED=true  docker compose run --rm k6 run -e LABEL=cache-on  /scripts/buy-flow.js
	@echo "Rodando com cache OFF..."
	CACHE_ENABLED=false docker compose run --rm k6 run -e LABEL=cache-off /scripts/buy-flow.js
	@echo "Resultados em k6/results/ — interface em http://localhost:8080/report/"
