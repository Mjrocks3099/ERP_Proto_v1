#!/usr/bin/env bash
# Cephlon ERP — Automated 502 Bad Gateway Diagnostic & Fix Script
# Run from repository root on the server: ./scripts/fix-502.sh

set -e

echo "========================================================"
echo " Cephlon ERP — 502 Bad Gateway Automated Fix"
echo "========================================================"

# 1. Check docker compose status
echo "[1/6] Checking Docker containers..."
if ! docker compose ps >/dev/null 2>&1; then
    echo "Error: docker compose is not running or not found in current directory."
    echo "Please cd to /opt/cephlon/erpnext and run this script."
    exit 1
fi

docker compose ps

# 2. Fix container permissions
echo "[2/6] Fixing permissions on bench and source directories..."
docker compose exec --user root frappe bash -c \
  "chown -R frappe:frappe /workspace/bench /workspace/erpnext-source 2>/dev/null || true"

# 3. Check bench initialization
echo "[3/6] Checking Bench Procfile..."
PROCFILE_EXISTS=$(docker compose exec --user frappe -T frappe bash -c '[ -f /workspace/bench/Procfile ] && echo "yes" || echo "no"')

if [ "$PROCFILE_EXISTS" != "yes" ]; then
    echo ""
    echo "⚠️  Procfile NOT FOUND at /workspace/bench/Procfile!"
    echo "This is why you get 502 Bad Gateway: Bench has not been initialized yet."
    echo "The frappe container is currently in sleep mode."
    echo ""
    echo "Please run the initialization steps from Step 7 of DEPLOY.md:"
    echo "  docker compose exec -it --user frappe frappe bash"
    echo ""
    echo "Inside the container, run:"
    echo "  bench init --ignore-exist --skip-redis-config-generation --frappe-branch develop /workspace/bench"
    echo "  ln -s /workspace/erpnext-source /workspace/bench/apps/erpnext"
    echo "  bench setup requirements"
    echo "  bench set-config -g db_host mariadb"
    echo "  bench set-config -g redis_cache redis://redis-cache:6379"
    echo "  bench set-config -g redis_queue redis://redis-queue:6379"
    echo "  bench set-config -g redis_socketio redis://redis-queue:6379"
    echo "  bench new-site YOUR_SERVER_IP --db-host mariadb --db-type mariadb --db-root-password YOUR_PASSWORD --admin-password YOUR_PASSWORD --mariadb-user-host-login-scope='%'"
    echo "  bench --site YOUR_SERVER_IP install-app erpnext"
    echo "  bench set-config -g default_site YOUR_SERVER_IP"
    echo "  exit"
    echo ""
    echo "Then re-run this script: ./scripts/fix-502.sh"
    exit 1
fi

# 4. Ensure Procfile binds to 0.0.0.0 (NOT 127.0.0.1)
echo "[4/6] Ensuring web server binds to 0.0.0.0 in Procfile..."
docker compose exec --user frappe -T frappe bash -c '
  sed -i "s/bench serve  *--port 8000/bench serve --host 0.0.0.0 --port 8000/" /workspace/bench/Procfile
  if ! grep -q -- "--host 0.0.0.0" /workspace/bench/Procfile; then
    sed -i "s/bench serve/bench serve --host 0.0.0.0/" /workspace/bench/Procfile
  fi
'

# 5. Ensure global config points to Docker service hostnames
echo "[5/6] Verifying Redis & MariaDB global configurations..."
docker compose exec --user frappe -T frappe bash -lc '
  cd /workspace/bench
  bench set-config -g db_host mariadb
  bench set-config -g redis_cache redis://redis-cache:6379
  bench set-config -g redis_queue redis://redis-queue:6379
  bench set-config -g redis_socketio redis://redis-queue:6379

  # Auto-detect site and set as default_site if not set
  SITES=$(ls -d sites/*/ 2>/dev/null | grep -v "assets" || true)
  for s in $SITES; do
    SITE_NAME=$(basename "$s")
    if [ "$SITE_NAME" != "assets" ] && [ -f "$s/site_config.json" ]; then
      bench set-config -g default_site "$SITE_NAME"
      echo "Set default_site to: $SITE_NAME"
      break
    fi
  done
'

# 6. Restart frappe and nginx
echo "[6/6] Restarting frappe and nginx containers..."
docker compose restart frappe nginx

echo ""
echo "Waiting 10 seconds for bench to spin up..."
sleep 10

echo "Checking Frappe container status:"
docker compose ps frappe

echo ""
echo "Recent logs from Frappe:"
docker compose logs --tail=25 frappe

echo ""
echo "========================================================"
echo " Testing connection from host:"
echo "========================================================"
if curl -I -m 5 http://127.0.0.1:3011 2>/dev/null; then
    echo "SUCCESS! App is responding on port 3011."
elif curl -I -m 5 http://127.0.0.1:8080 2>/dev/null; then
    echo "SUCCESS! App is responding on port 8080."
else
    echo "Connection test finished. Check logs above if you still see 502."
fi

