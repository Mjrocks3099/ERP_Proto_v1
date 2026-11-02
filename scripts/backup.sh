#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIRECTORY="${1:-./backups}"
SITE="${2:-development.localhost}"
: "${MARIADB_ROOT_PASSWORD:?Set MARIADB_ROOT_PASSWORD before creating a backup}"

mkdir -p "$OUTPUT_DIRECTORY"
STAMP="$(date +%Y%m%d-%H%M%S)"
DATABASE_FILE="$OUTPUT_DIRECTORY/mariadb-$STAMP.sql"

docker compose exec -T -e "MYSQL_PWD=${MARIADB_ROOT_PASSWORD}" mariadb mariadb-dump \
  --single-transaction --routines --events -uroot --all-databases > "$DATABASE_FILE"
docker compose exec -T -w /workspace/bench frappe bench --site "$SITE" backup --with-files

echo "Database backup written to $DATABASE_FILE"
echo "Bench file backup completed for $SITE"
