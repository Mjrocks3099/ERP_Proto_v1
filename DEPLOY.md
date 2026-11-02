# Cephlon ERP — Production Deployment Guide

> Step-by-step Docker deployment for **Cephlon ERP** (Frappe + ERPNext) on a Linux server.

---

## Architecture Overview

```
Internet
   │
   ▼
Nginx :80 / :443  ──── (TLS termination, reverse proxy)
   │
   ├──▶ Frappe web process :8000  ◀──▶  MariaDB :3306
   │              │
   │              ├──▶ Redis cache  :6379
   │              └──▶ Redis queue  :6379
   │
   └──▶ Frappe socketio :9000

Server disk: /opt/cephlon/erpnext
   └──▶ mounted as /workspace/erpnext-source inside the frappe container
              └──▶ symlinked to /workspace/bench/apps/erpnext
```

---

## Files Changed / Key Files Reference

| File | Purpose |
|---|---|
| `erpnext/hooks.py` | App config, CSS/JS includes, version cache busting |
| `erpnext/public/css/cephlon-dashboard-panel.css` | Sidebar/navbar dark theme + sizing |
| `erpnext/public/css/cephlon-dashboard-home.css` | Home banner styles |
| `erpnext/public/css/cephlon-erp-login.css` | Login page styles |
| `erpnext/public/js/cephlon-dashboard-home.js` | Home banner injection + branding JS |
| `erpnext/public/images/cephlon-logo.png` | Cephlon logo used across the app |
| `docker-compose.yml` | All services (MariaDB, Redis, Frappe, Nginx) |
| `nginx/default.conf` | Nginx reverse proxy config |
| `.env.example` | Template for secrets (copy to .env) |

---

## Part 1 — Server Prerequisites

### Minimum Server Specs

| Resource | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB | 80 GB SSD |
| Network | Public IP + domain | Same |

### Install Docker & Git

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker Engine
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin git

# Start and enable Docker
sudo systemctl enable --now docker

# Allow your user to run Docker without sudo
sudo usermod -aG docker "$USER"
newgrp docker
```

Verify:

```bash
docker --version        # Docker version 26+
docker compose version  # Docker Compose version v2+
git --version           # git version 2+
```

---

## Part 2 — Get the Code onto the Server

### Option A — Git Clone (recommended)

Push your local code to a Git repository (GitHub / GitLab / Gitea), then on the server:

```bash
sudo mkdir -p /opt/cephlon
sudo chown -R "$USER":"$USER" /opt/cephlon

git clone https://github.com/YOUR_ORG/YOUR_REPO.git /opt/cephlon/erpnext
cd /opt/cephlon/erpnext
```

> **Important:** Make sure your `.gitignore` excludes `.venv/`, `node_modules/`,
> `erpnext/public/dist/` build output, and `.env` (secrets). Never commit passwords.

### Option B — rsync from Windows

From your Windows machine (WSL or Git Bash):

```bash
rsync -avz --exclude=".venv" --exclude="node_modules" --exclude=".env" \
  /c/erpnext/ user@YOUR_SERVER_IP:/opt/cephlon/erpnext/
```

Or with `scp` (PowerShell):

```powershell
scp -r C:\erpnext user@YOUR_SERVER_IP:/opt/cephlon/erpnext
```

---

## Part 3 — Configure Secrets

> **CAUTION:** Never commit `.env` or hardcoded passwords to Git.
> The default password `123` in `docker-compose.yml` is for development only.

```bash
cd /opt/cephlon/erpnext

# Create .env from the template
cp .env.example .env

# Edit and set a strong random password
nano .env
```

`.env` contents:

```env
MARIADB_ROOT_PASSWORD=YourSuperStrongPasswordHere123!
```

Generate a strong password:

```bash
openssl rand -base64 32
```

---

## Part 4 — Production docker-compose.yml Changes

Your current `docker-compose.yml` is a **dev** file. Make these changes for production:

### 4a. Change Nginx port from 8080 to 80

```yaml
# In docker-compose.yml, under nginx → ports:
ports:
  - "80:80"
```

### 4b. Auto-start Frappe on container restart

Change the `frappe` service `command` from `sleep infinity` to:

```yaml
frappe:
  image: frappe/bench:latest
  restart: unless-stopped
  working_dir: /workspace/bench
  command: bash -lc "bench start"    # <-- change this line
  depends_on:
    - mariadb
    - redis-cache
    - redis-queue
  volumes:
    - bench-data:/workspace/bench
    - .:/workspace/erpnext-source:cached
  networks:
    - backend
    - edge
```

### 4c. (Optional) Pin image versions for stability

```yaml
image: redis:7-alpine       # instead of redis:alpine
image: nginx:1.27-alpine    # instead of nginx:alpine
```

---

## Part 5 — Nginx Config for Production (HTTPS)

### Get a free TLS certificate

Run this **before** starting Docker on port 80:

```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d erp.yourdomain.com
```

### Update nginx/default.conf

Replace the contents of `nginx/default.conf`:

```nginx
server {
    listen 80;
    server_name erp.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name erp.yourdomain.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    server_tokens off;
    client_max_body_size 50m;

    add_header X-Content-Type-Options  "nosniff"                         always;
    add_header X-Frame-Options         "SAMEORIGIN"                      always;
    add_header Referrer-Policy         "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location /socket.io {
        proxy_pass http://frappe:9000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://frappe:8000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_connect_timeout 15s;
        proxy_send_timeout    120s;
        proxy_read_timeout    120s;
    }
}
```

### Mount TLS certs in docker-compose.yml

```yaml
nginx:
  volumes:
    - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    - /etc/letsencrypt/live/erp.yourdomain.com:/etc/nginx/certs:ro
  ports:
    - "80:80"
    - "443:443"
```

---

## Part 6 — Start All Services

```bash
cd /opt/cephlon/erpnext
docker compose up -d
docker compose ps
```

Expected — all 5 services `Up`:

```
NAME                    IMAGE                STATUS
erpnext-mariadb-1       mariadb:11.8         Up
erpnext-redis-cache-1   redis:alpine         Up
erpnext-redis-queue-1   redis:alpine         Up
erpnext-frappe-1        frappe/bench:latest  Up
erpnext-nginx-1         nginx:alpine         Up
```

---

## Part 7 — Initialize Bench (first time only)

```bash
docker compose exec frappe bash
```

Inside the container, run all of these:

```bash
# 1. Init bench if not already done
if [ ! -f /workspace/bench/apps/frappe/pyproject.toml ]; then
  bench init --ignore-exist --skip-redis-config-generation \
    --frappe-branch develop /workspace/bench
fi

# 2. Link Cephlon ERPNext source
if [ ! -e /workspace/bench/apps/erpnext ]; then
  ln -s /workspace/erpnext-source /workspace/bench/apps/erpnext
fi
grep -qxF erpnext /workspace/bench/sites/apps.txt 2>/dev/null \
  || echo erpnext >> /workspace/bench/sites/apps.txt

# 3. Allow git to read the mounted source
git config --global --add safe.directory /workspace/erpnext-source

# 4. Install Python dependencies
cd /workspace/bench
bench setup requirements

# 5. Point bench at Docker service hostnames
bench set-config -g db_host mariadb
bench set-config -g redis_cache   redis://redis-cache:6379
bench set-config -g redis_queue   redis://redis-queue:6379
bench set-config -g redis_socketio redis://redis-queue:6379
```

---

## Part 8 — Create the Production Site

Still inside the Frappe container:

```bash
cd /workspace/bench

# Replace values below with your domain and passwords
bench new-site erp.yourdomain.com \
  --db-root-password 'YourSuperStrongPasswordHere123!' \
  --admin-password  'YourAdminPassword456!' \
  --mariadb-user-host-login-scope='%'

# Install the Cephlon ERPNext app
bench --site erp.yourdomain.com install-app erpnext

# Disable developer mode for production
bench --site erp.yourdomain.com set-config developer_mode 0

# Clear cache
bench --site erp.yourdomain.com clear-cache
```

Exit the container:

```bash
exit
```

---

## Part 9 — Build Frontend Assets

This compiles your Cephlon CSS, JS and all ERPNext bundles:

```bash
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench build --app erpnext"

docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench --site erp.yourdomain.com clear-cache"
```

> **Tip:** If the browser still shows old CSS after a build, bump the `?v=N` numbers
> in `erpnext/hooks.py` under `app_include_css`. Current versions are:
> - `cephlon-dashboard-panel.css?v=8`
> - `cephlon-dashboard-home.css?v=12`
> - `cephlon-erp-login.css?v=6`

---

## Part 10 — Start Frappe (if not using auto-start)

If you didn't change `command:` to `bash -lc "bench start"` in Part 4:

```bash
docker compose exec -d frappe bash -lc \
  "cd /workspace/bench && bench start"
```

Test the site responds:

```bash
curl -I http://localhost:80
# Expected: HTTP/1.1 200 OK  (or 302 to HTTPS)
```

---

## Part 11 — Firewall Setup

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

> **CAUTION:** Do NOT expose MariaDB (3306) or Redis (6379) to the internet.
> They sit on the `backend` internal Docker network and are never published — keep it that way.

---

## Part 12 — Deploying Code Changes

Every time you update Cephlon customizations on your local machine:

### Step 1 — Push to Git (on Windows)

```powershell
git add .
git commit -m "feat: your change description"
git push origin main
```

### Step 2 — Pull on server

```bash
cd /opt/cephlon/erpnext
git pull origin main
```

### Step 3 — Rebuild assets

```bash
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench build --app erpnext"
```

### Step 4 — Run migrations (only if Python/doctype files changed)

```bash
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench --site erp.yourdomain.com migrate"
```

### Step 5 — Clear cache and restart

```bash
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench --site erp.yourdomain.com clear-cache"

docker compose restart frappe nginx
```

### CSS/JS-only fast path

If you only changed `.css` or `.js` files in `erpnext/public/`:

```bash
git pull origin main
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench build --app erpnext && bench --site erp.yourdomain.com clear-cache"
docker compose restart nginx
```

---

## Part 13 — Backup & Restore

### Take a backup

```bash
# Full database dump
docker compose exec -T mariadb mariadb-dump \
  -uroot -p'YourSuperStrongPasswordHere123!' \
  --all-databases > erpnext-db-$(date +%F).sql

# Frappe site backup with uploaded files
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench --site erp.yourdomain.com backup --with-files"
```

Backup files land inside the `bench-data` volume at:
`/workspace/bench/sites/erp.yourdomain.com/private/backups/`

### Restore from backup

```bash
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench --site erp.yourdomain.com restore \
   sites/erp.yourdomain.com/private/backups/BACKUP_FILE.sql.gz"
```

### Automate daily backups (cron)

```bash
# Run: crontab -e
# Add this line (runs at 2 AM daily):
0 2 * * * cd /opt/cephlon/erpnext && docker compose exec -T frappe bash -lc "cd /workspace/bench && bench --site erp.yourdomain.com backup --with-files" >> /var/log/erpnext-backup.log 2>&1
```

---

## Part 14 — Monitoring & Logs

```bash
# Live logs from all containers
docker compose logs -f

# Per-service logs
docker compose logs -f frappe
docker compose logs -f nginx
docker compose logs -f mariadb

# Container health
docker compose ps

# Disk usage
docker system df
df -h /opt/cephlon
```

---

## Part 15 — Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `ERR_CONNECTION_REFUSED` | Nginx not running | `docker compose up -d` |
| `502 Bad Gateway` | Frappe not started | `docker compose exec -d frappe bash -lc "cd /workspace/bench && bench start"` |
| Old CSS/JS in browser | Cache not cleared | Bump `?v=N` in `hooks.py`, run `bench build`, `bench --site ... clear-cache`, Ctrl+Shift+R |
| DB authentication error | Wrong password | Check `.env` matches `MARIADB_ROOT_PASSWORD` in `docker-compose.yml` |
| `Site erp.yourdomain.com not found` | Wrong site name | Use exact name from `bench new-site` |
| Assets 404 | Build not run | `bench build --app erpnext` |
| `fatal: dubious ownership` | Git safe.directory | `git config --global --add safe.directory /workspace/erpnext-source` |
| Frappe stops after restart | Auto-start not set | Change `command: sleep infinity` to `command: bash -lc "bench start"` |

---

## Production Checklist

- [ ] `.env` created with strong `MARIADB_ROOT_PASSWORD`
- [ ] `.env` is in `.gitignore` — never committed to Git
- [ ] `developer_mode` set to `0` on the production site
- [ ] Nginx port changed from `8080` → `80` (and `443` for HTTPS)
- [ ] TLS certificate obtained and auto-renews (`certbot renew --dry-run`)
- [ ] `nginx/default.conf` updated with your real domain and SSL paths
- [ ] DNS A record pointing to server IP
- [ ] Firewall: only SSH (22), 80, 443 open
- [ ] MariaDB (3306) and Redis (6379) NOT publicly exposed
- [ ] Frappe auto-starts on container restart (`command: bash -lc "bench start"`)
- [ ] `bench build --app erpnext` run after every code change
- [ ] Daily backup cron job configured
- [ ] Restore procedure tested at least once
- [ ] Logs monitored (`docker compose logs -f`)
- [ ] Disk space monitored

