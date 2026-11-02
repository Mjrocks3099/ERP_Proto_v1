#!/usr/bin/env bash
set -euo pipefail

DUMP_FILE="${1:?Usage: $0 path/to/mariadb-dump.sql [restore-project]}"
RESTORE_PROJECT="${2:-cephlon-restore}"

if [[ ! -f "$DUMP_FILE" ]]; then
  printf 'Backup file not found: %s\n' "$DUMP_FILE" >&2
  exit 1
fi
if [[ "$RESTORE_PROJECT" == "cephlon-erp" || "$RESTORE_PROJECT" == "erpnext" ]]; then
  printf 'Refusing to use the production/default project name: %s\n' "$RESTORE_PROJECT" >&2
  exit 1
fi
: "${MARIADB_ROOT_PASSWORD:?Set MARIADB_ROOT_PASSWORD for the isolated restore database}"

COMPOSE=(docker compose -p "$RESTORE_PROJECT" -f docker-compose.yml -f docker-compose.production.yml)
cleanup() { "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${COMPOSE[@]}" up -d mariadb
until "${COMPOSE[@]}" exec -T mariadb healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; do
  sleep 3
done

"${COMPOSE[@]}" exec -T -e "MYSQL_PWD=${MARIADB_ROOT_PASSWORD}" mariadb mariadb -uroot < "$DUMP_FILE"
"${COMPOSE[@]}" exec -T -e "MYSQL_PWD=${MARIADB_ROOT_PASSWORD}" mariadb mariadb -uroot -e "SHOW DATABASES;"
printf 'Isolated database restore completed successfully for project %s.\n' "$RESTORE_PROJECT"
