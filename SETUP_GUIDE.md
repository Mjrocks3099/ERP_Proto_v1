# Cephlon ERPNext Docker Server Setup

This guide deploys the source-mounted ERPNext/Frappe stack in [docker-compose.yml](./docker-compose.yml).

## Architecture

```text
Browser -> Nginx :8080 -> Frappe Bench :8000
                         -> MariaDB :3306
                         -> Redis :6379
C:/erpnext -> /workspace/erpnext-source -> /workspace/bench/apps/erpnext
```

## 1. Server prerequisites

Recommended: Ubuntu 22.04+, 4 CPU cores, 8 GB RAM, 50 GB free disk, Docker Engine, Docker Compose v2, and Git.

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Log out and back in after adding the user to the Docker group. On Windows Server, install Docker Desktop and use PowerShell.

## 2. Copy the project

```bash
sudo mkdir -p /opt/cephlon
sudo chown -R "$USER":"$USER" /opt/cephlon
git clone YOUR_REPOSITORY_URL /opt/cephlon/erpnext
cd /opt/cephlon/erpnext
```

Do not copy `.venv`, `node_modules`, temporary build output, or database files.

## 3. Configure secrets

Edit [docker-compose.yml](./docker-compose.yml) before production use. Replace development passwords such as `123` with strong secrets. Never commit production passwords.

Also review ports, volume names, Nginx hostnames, upload limits, DNS, and TLS settings.

## 4. Start services

```bash
cd /opt/cephlon/erpnext
docker compose up -d
docker compose ps
```

Expected services: `mariadb`, `redis-cache`, `redis-queue`, `frappe`, and `nginx`.

## 5. Initialize Bench

```bash
docker compose exec frappe bash
```

Inside the container:

```bash
if [ ! -f /workspace/bench/apps/frappe/pyproject.toml ]; then
  bench init --ignore-exist --skip-redis-config-generation --frappe-branch develop /workspace/bench
fi
if [ ! -e /workspace/bench/apps/erpnext ]; then
  ln -s /workspace/erpnext-source /workspace/bench/apps/erpnext
fi
grep -qxF erpnext /workspace/bench/sites/apps.txt 2>/dev/null || echo erpnext >> /workspace/bench/sites/apps.txt
cd /workspace/bench
bench setup requirements
bench set-config -g db_host mariadb
bench set-config -g redis_cache redis://redis-cache:6379
bench set-config -g redis_queue redis://redis-queue:6379
bench set-config -g redis_socketio redis://redis-queue:6379
```

## 6. Create the site

Use the MariaDB root password from Compose:

```bash
cd /workspace/bench
bench new-site erp.example.com --db-root-password 'DATABASE_PASSWORD' --admin-password 'ADMIN_PASSWORD' --mariadb-user-host-login-scope='%'
bench --site erp.example.com install-app erpnext
bench --site erp.example.com set-config developer_mode 0
bench --site erp.example.com clear-cache
```

Use `development.localhost` instead of `erp.example.com` for local development.

## 7. Start Frappe

The current development Compose file keeps the Frappe container alive, but Bench must be started inside it:

```bash
docker compose exec -d frappe bash -lc "cd /workspace/bench && bench start"
curl -I http://127.0.0.1:8080
```

Run the Bench command again after recreating the Frappe container. A production server should use a supervisor or a Compose startup command.

## 8. Access

Local URL:

```text
http://development.localhost:8080
```

Production URL after DNS/TLS configuration:

```text
https://erp.example.com
```

Login with `Administrator` and the password supplied to `bench new-site`.

## 9. Build after source changes

Editable source is under [erpnext/](./erpnext/). Main customization files include [hooks.py](./erpnext/hooks.py), [cephlon-erp-login.css](./erpnext/public/css/cephlon-erp-login.css), [cephlon-erp-login.js](./erpnext/public/js/cephlon-erp-login.js), [cephlon-dashboard-panel.css](./erpnext/public/css/cephlon-dashboard-panel.css), and [cephlon-logo.png](./erpnext/public/images/cephlon-logo.png).

```bash
docker compose exec -T frappe bash -lc "cd /workspace/bench && bench build --app erpnext"
docker compose exec -T -w /workspace/bench frappe bench --site erp.example.com clear-cache
```

Then use `Ctrl+F5`. Increment asset query versions in [hooks.py](./erpnext/hooks.py) if the browser serves old CSS or JavaScript.

## 10. DNS, TLS, and firewall

Nginx is configured in [nginx/default.conf](./nginx/default.conf) and publishes development port `8080`. For production, put HTTPS in front of it, point DNS to the server, and expose only ports 80 and 443. Do not expose MariaDB or Redis.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 11. Backups and updates

```bash
docker compose exec -T mariadb mariadb-dump -uroot -p'DATABASE_PASSWORD' --all-databases > erpnext-database-$(date +%F).sql
docker compose exec -T -w /workspace/bench frappe bench --site erp.example.com backup --with-files
```

Back up the `mariadb-data` and `bench-data` volumes and test restores.

Before an update:

```bash
docker compose exec -T -w /workspace/bench frappe bench --site erp.example.com migrate
docker compose exec -T frappe bash -lc "cd /workspace/bench && bench build --app erpnext"
docker compose exec -T -w /workspace/bench frappe bench --site erp.example.com clear-cache
docker compose restart frappe nginx
```

## 12. Troubleshooting

`ERR_CONNECTION_REFUSED`:

```bash
docker compose up -d
docker compose ps
```

`502 Bad Gateway`:

```bash
docker compose exec -d frappe bash -lc "cd /workspace/bench && bench start"
docker compose logs --tail=100 frappe
docker compose logs --tail=100 nginx
```

If a build reports the existing Banking/Vite missing `/sites/common_site_config.json` error after `Application Assets Linked`, the direct custom CSS/JavaScript files may still be served, but the Banking build configuration should be fixed before production.

## Production checklist

- [ ] Strong secrets are not committed
- [ ] HTTPS and DNS are configured
- [ ] Firewall is enabled
- [ ] MariaDB and Redis are private
- [ ] Volumes are backed up
- [ ] Restore procedure is tested
- [ ] Bench startup is supervised
- [ ] Logs and disk usage are monitored
