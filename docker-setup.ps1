$ErrorActionPreference = "Stop"

Write-Host "Starting MariaDB, Redis, and the Frappe development container..."
docker compose up -d

function Invoke-Frappe([string]$Command) {
    docker compose exec -T frappe bash -lc $Command
    if ($LASTEXITCODE -ne 0) { throw "Container command failed: $Command" }
}

Write-Host "Creating the Bench and downloading the matching Frappe source..."
Invoke-Frappe 'if [ ! -f /workspace/bench/apps/frappe/pyproject.toml ]; then bench init --ignore-exist --skip-redis-config-generation --frappe-branch develop /workspace/bench; fi'

Write-Host "Linking the editable ERPNext source from C:/erpnext..."
Invoke-Frappe 'if [ ! -e /workspace/bench/apps/erpnext ]; then ln -s /workspace/erpnext-source /workspace/bench/apps/erpnext; fi; if ! grep -qxF erpnext /workspace/bench/sites/apps.txt 2>/dev/null; then printf "\n" >> /workspace/bench/sites/apps.txt; echo erpnext >> /workspace/bench/sites/apps.txt; fi'

Invoke-Frappe 'git config --global --add safe.directory /workspace/erpnext-source'
Invoke-Frappe 'cd /workspace/bench && bench setup requirements'

Invoke-Frappe 'cd /workspace/bench && bench set-config -g db_host mariadb && bench set-config -g redis_cache redis://redis-cache:6379 && bench set-config -g redis_queue redis://redis-queue:6379 && bench set-config -g redis_socketio redis://redis-queue:6379'

Write-Host "Creating the development site..."
Invoke-Frappe 'cd /workspace/bench && if [ ! -d sites/development.localhost ]; then bench new-site --db-root-password 123 --admin-password admin --mariadb-user-host-login-scope=% development.localhost; fi'
Invoke-Frappe 'cd /workspace/bench && bench --site development.localhost set-config developer_mode 1 && bench --site development.localhost install-app erpnext && bench --site development.localhost clear-cache'
Invoke-Frappe 'sed -i "s/bench serve  --port 8000/bench serve --host 0.0.0.0 --port 8000/" /workspace/bench/Procfile'

Write-Host "Starting Frappe..."
docker compose exec -d frappe bash -lc 'cd /workspace/bench && bench start'

Write-Host "ERPNext is starting through Nginx at http://development.localhost:8080"
Write-Host "Login: Administrator / admin"
