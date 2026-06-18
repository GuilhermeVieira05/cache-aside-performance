.PHONY: start stop logs seed reset loadtest loadtest-live

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
	@bash scripts/loadtest.sh

loadtest-live:
	@bash scripts/loadtest-live.sh
