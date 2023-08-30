#!/bin/bash
set -e

POSTGRES_MEMBER_PASSWORD="$(< "${POSTGRES_MEMBER_PASSWORD_FILE}")"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER $POSTGRES_MEMBER_USER PASSWORD '$POSTGRES_MEMBER_PASSWORD';
	CREATE DATABASE $POSTGRES_MEMBER_DB OWNER $POSTGRES_MEMBER_USER;
EOSQL