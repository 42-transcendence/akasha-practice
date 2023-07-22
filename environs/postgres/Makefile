start:
	docker compose up

stop:
	docker compose down

clear:
	docker compose down -v

secret:
	mkdir -p .secret.d
	openssl rand -base64 20 > .secret.d/postgres_password.txt
	openssl rand -base64 20 > .secret.d/postgres_member_password.txt
	openssl rand -base64 20 > .secret.d/pgadmin_password.txt
