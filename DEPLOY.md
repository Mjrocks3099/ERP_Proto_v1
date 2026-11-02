# Cephlon ERP — Server Deployment Guide (IP + Port)

Access the app at:  **`http://YOUR_SERVER_IP:8080`**

No domain name or HTTPS needed.

***

No domain name or HTTPS needed.

***

## Architecture

```
Browser
   │
   ▼
http://YOUR_SERVER_IP:8080
   │
Nginx (port 8080 → internal 80)
   │
   ├──▶ Frappe web process :8000  ◀──▶  MariaDB :3306
   │              │
   │              ├──▶ Redis cache  :6379
   │              └──▶ Redis queue  :6379
   └──▶ Frappe socketio :9000

Server disk: /opt/cephlon/erpnext
   └──▶ mounted as /workspace/erpnext-source in the frappe container
              └──▶ symlinked to /workspace/bench/apps/erpnext
```

***

***

## Key Files Reference

| File                                                                                                 | Purpose                                        |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`docker-compose.yml`](./docker-compose.yml)                                                         | All services — Nginx exposes port `8080`       |
| [`nginx/default.conf`](./nginx/default.conf)                                                         | Reverse proxy — `server_name _` accepts any IP |
| [`.env.example`](./.env.example)                                                                     | Copy to `.env` and set DB password             |
| [`erpnext/hooks.py`](./erpnext/hooks.py)                                                             | App config, CSS/JS version cache busting       |
| [`erpnext/public/css/cephlon-dashboard-panel.css`](./erpnext/public/css/cephlon-dashboard-panel.css) | Navbar/sidebar dark theme                      |
| [`erpnext/public/js/cephlon-dashboard-home.js`](./erpnext/public/js/cephlon-dashboard-home.js)       | Branding JS                                    |
| File                                                                                                 | Purpose                                        |
| ---                                                                                                  | ---                                            |
| [`docker-compose.yml`](./docker-compose.yml)                                                         | All services — Nginx exposes port `8080`       |
| [`nginx/default.conf`](./nginx/default.conf)                                                         | Reverse proxy — `server_name _` accepts any IP |
| [`.env.example`](./.env.example)                                                                     | Copy to `.env` and set DB password             |
| [`erpnext/hooks.py`](./erpnext/hooks.py)                                                             | App config, CSS/JS version cache busting       |
| [`erpnext/public/css/cephlon-dashboard-panel.css`](./erpnext/public/css/cephlon-dashboard-panel.css) | Navbar/sidebar dark theme                      |
| [`erpnext/public/js/cephlon-dashboard-home.js`](./erpnext/public/js/cephlon-dashboard-home.js)       | Branding JS                                    |

***

***

## Step 1 — Server Requirements

| Resource | Minimum                    |
| -------- | -------------------------- |
| OS       | Ubuntu 22.04 LTS           |
| CPU      | 2 cores                    |
| RAM      | 4 GB                       |
| Disk     | 40 GB                      |
| Network  | Server with a reachable IP |
| Resource | Minimum                    |
| ---      | ---                        |
| OS       | Ubuntu 22.04 LTS           |
| CPU      | 2 cores                    |
| RAM      | 4 GB                       |
| Disk     | 40 GB                      |
| Network  | Server with a reachable IP |

### Install Docker & Git

````Shell
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release git

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" && newgrp docker
````

Verify:

````Shell
```bash
docker --version         # Docker version 26+
docker compose version   # Docker Compose version v2+
````

***

***

## Step 2 — Copy Code to Server

### Option A — Git clone (recommended)

````Shell
```bash
sudo mkdir -p /opt/cephlon
sudo chown -R "$USER":"$USER" /opt/cephlon
git clone https://github.com/YOUR_ORG/YOUR_REPO.git /opt/cephlon/erpnext
cd /opt/cephlon/erpnext
````

### Option B — rsync from Windows

Run in WSL or Git Bash on your Windows machine:

````Shell
```bash
rsync -avz \
  --exclude=".venv" \
  --exclude="node_modules" \
  --exclude=".env" \
  --exclude="erpnext/public/dist" \
  /c/erpnext/ user@YOUR_SERVER_IP:/opt/cephlon/erpnext/
````

***

***

## Step 3 — Set the Database Password

````Shell
```bash
cd /opt/cephlon/erpnext
cp .env.example .env
nano .env
````

Set a strong password:

```env
MARIADB_ROOT_PASSWORD=YourStrongPassword123!
```

Generate one with: `openssl rand -base64 24`

> **Never commit** **`.env`** **to Git.**
> **Never commit** **`.env`** **to Git.**

***

***

## Step 4 — Open Port 8080 on the Server Firewall

````Shell
```bash
sudo ufw allow OpenSSH
sudo ufw allow 8080/tcp
sudo ufw enable
sudo ufw status
````

> MariaDB (3306) and Redis (6379) stay on the internal Docker network — never expose them.

***

***

## Step 5 — Start All Services

````Shell
```bash
cd /opt/cephlon/erpnext
docker compose up -d
docker compose ps
````

All 5 services should show **Up**:

```
NAME                    IMAGE                STATUS
erpnext-mariadb-1       mariadb:11.8         Up
erpnext-redis-cache-1   redis:alpine         Up
erpnext-redis-queue-1   redis:alpine         Up
erpnext-frappe-1        frappe/bench:latest  Up
erpnext-nginx-1         nginx:alpine         Up
```

***

***

## Step 6 — Initialize Bench (first time only)

````Shell
```bash
docker compose exec frappe bash
````

Run all commands inside the container:

````Shell
```bash
# Init bench if not done yet
if [ ! -f /workspace/bench/apps/frappe/pyproject.toml ]; then
  bench init --ignore-exist --skip-redis-config-generation \
    --frappe-branch develop /workspace/bench
fi

# Link Cephlon source
if [ ! -e /workspace/bench/apps/erpnext ]; then
  ln -s /workspace/erpnext-source /workspace/bench/apps/erpnext
fi
grep -qxF erpnext /workspace/bench/sites/apps.txt 2>/dev/null \
  || echo erpnext >> /workspace/bench/sites/apps.txt

# Allow git access to mounted source
git config --global --add safe.directory /workspace/erpnext-source

# Install Python dependencies
cd /workspace/bench
bench setup requirements

# Point bench at Docker service names
bench set-config -g db_host mariadb
bench set-config -g redis_cache    redis://redis-cache:6379
bench set-config -g redis_queue    redis://redis-queue:6379
bench set-config -g redis_socketio redis://redis-queue:6379
````

***

***

## Step 7 — Create the Site

Still inside the container — use the server's **IP address** as the site name:

````Shell
```bash
cd /workspace/bench

# Replace 192.168.1.100 with your actual server IP
# Replace the passwords with your own
bench new-site 192.168.1.100 \
  --db-root-password 'YourStrongPassword123!' \
  --admin-password  'YourAdminPassword456!' \
  --mariadb-user-host-login-scope='%'

bench --site 192.168.1.100 install-app erpnext
bench --site 192.168.1.100 set-config developer_mode 0
bench --site 192.168.1.100 clear-cache
````

Exit the container:

````Shell
```bash
exit
````

***

***

## Step 8 — Build Frontend Assets

````Shell
```bash
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench build --app erpnext"

docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench --site 192.168.1.100 clear-cache"
````

> If old CSS still appears after a build: bump the `?v=N` version number in
> `erpnext/hooks.py` for the changed file, rebuild, clear-cache, then Ctrl+Shift+R.

***

***

## Step 9 — Access the App

Open in your browser:

```
http://YOUR_SERVER_IP:8080
```

Login with:

* **Username:** `Administrator`
* **Password:** the `--admin-password` you set in Step 7

- **Username:** `Administrator`
- **Password:** the `--admin-password` you set in Step 7

***

***

## Deploying Code Changes

Every time you update files on Windows and want the server to reflect them:

### CSS / JS only (fast)

````Shell
```bash
# On Windows → push to Git
git add . && git commit -m "fix: navbar styles" && git push

# On the server
cd /opt/cephlon/erpnext
git pull origin main
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench build --app erpnext && bench --site 192.168.1.100 clear-cache"
docker compose restart nginx
````

### Python / hooks / doctypes (full deploy)

````Shell
```bash
cd /opt/cephlon/erpnext
git pull origin main
docker compose exec -T frappe bash -lc "cd /workspace/bench && bench build --app erpnext"
docker compose exec -T frappe bash -lc "cd /workspace/bench && bench --site 192.168.1.100 migrate"
docker compose exec -T frappe bash -lc "cd /workspace/bench && bench --site 192.168.1.100 clear-cache"
docker compose restart frappe nginx
````

***

***

## Backup

````Shell
```bash
# Database
docker compose exec -T mariadb mariadb-dump \
  -uroot -p'YourStrongPassword123!' \
  --all-databases > erpnext-db-$(date +%F).sql

# Site files
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench --site 192.168.1.100 backup --with-files"
````

***

***

## Troubleshooting

| Symptom                               | Fix                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `ERR_CONNECTION_REFUSED` on port 8080 | `docker compose up -d` and check `sudo ufw allow 8080/tcp`                     |
| `502 Bad Gateway`                     | Frappe not started — check `docker compose logs frappe`                        |
| Old CSS showing                       | Bump `?v=N` in `hooks.py` → `bench build` → `bench clear-cache` → Ctrl+Shift+R |
| `Site 192.168.x.x not found`          | Use exact IP from `bench new-site` — must match the URL you browse to          |
| DB auth failed                        | Check `.env` password matches `docker-compose.yml` variable                    |
| `dubious ownership` git error         | `git config --global --add safe.directory /workspace/erpnext-source`           |
| Frappe stops after reboot             | Already fixed: `docker-compose.yml` now uses `command: bash -lc "bench start"` |
| Symptom                               | Fix                                                                            |
| ---                                   | ---                                                                            |
| `ERR_CONNECTION_REFUSED` on port 8080 | `docker compose up -d` and check `sudo ufw allow 8080/tcp`                     |
| `502 Bad Gateway`                     | Frappe not started — check `docker compose logs frappe`                        |
| Old CSS showing                       | Bump `?v=N` in `hooks.py` → `bench build` → `bench clear-cache` → Ctrl+Shift+R |
| `Site 192.168.x.x not found`          | Use exact IP from `bench new-site` — must match the URL you browse to          |
| DB auth failed                        | Check `.env` password matches `docker-compose.yml` variable                    |
| `dubious ownership` git error         | `git config --global --add safe.directory /workspace/erpnext-source`           |
| Frappe stops after reboot             | Already fixed: `docker-compose.yml` now uses `command: bash -lc "bench start"` |

***

***

## Checklist

* [ ] Docker and Git installed on server
* [ ] `.env` created with strong password (not `123`)
* [ ] `.env` is in `.gitignore`
* [ ] Port `8080` open in firewall (`ufw allow 8080/tcp`)
* [ ] MariaDB (3306) and Redis (6379) NOT open in firewall
* [ ] Site created with server IP as site name
* [ ] `bench build --app erpnext` run
* [ ] App loads at `http://YOUR_SERVER_IP:8080`
* [ ] `developer_mode = 0` on the site
* [ ] Backup procedure tested

- [ ] Docker and Git installed on server
- [ ] `.env` created with strong password (not `123`)
- [ ] `.env` is in `.gitignore`
- [ ] Port `8080` open in firewall (`ufw allow 8080/tcp`)
- [ ] MariaDB (3306) and Redis (6379) NOT open in firewall
- [ ] Site created with server IP as site name
- [ ] `bench build --app erpnext` run
- [ ] App loads at `http://YOUR_SERVER_IP:8080`
- [ ] `developer_mode = 0` on the site
- [ ] Backup procedure tested

