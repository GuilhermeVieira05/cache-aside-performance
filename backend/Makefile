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

reset:
	docker-compose down -v
	docker-compose up --build -d
	docker-compose run --rm web rails db:create db:migrate
