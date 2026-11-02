# Cephlon ERP — Server Deployment Guide (IP + Port)

Access the app at:  **`http://YOUR_SERVER_IP:8080`**

No domain name or HTTPS needed.

---

## How the Startup Works

```
First run (bench not initialized):
  frappe-start.sh → Procfile NOT found → sleep infinity (container stays alive)
  → You run bench init steps manually
  → docker compose restart frappe
  → frappe-start.sh → Procfile FOUND → bench start ✅

Every restart after that:
  frappe-start.sh → Procfile FOUND → bench start ✅  (fully automatic)
```

---

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
```

---

## Key Files Reference

| File | Purpose |
|---|---|
| [`docker-compose.yml`](./docker-compose.yml) | All services — Nginx exposes port `8080` |
| [`frappe-start.sh`](./frappe-start.sh) | Smart startup — waits for bench init, then runs `bench start` |
| [`nginx/default.conf`](./nginx/default.conf) | Reverse proxy — `server_name _` accepts any IP |
| [`.env.example`](./.env.example) | Copy to `.env` and set DB password |
| [`erpnext/hooks.py`](./erpnext/hooks.py) | App config, CSS/JS version cache busting |
| [`erpnext/public/css/cephlon-dashboard-panel.css`](./erpnext/public/css/cephlon-dashboard-panel.css) | Navbar/sidebar dark theme |
| [`erpnext/public/js/cephlon-dashboard-home.js`](./erpnext/public/js/cephlon-dashboard-home.js) | Branding JS |

---

## Step 1 — Server Requirements

| Resource | Minimum |
|---|---|
| OS | Ubuntu 22.04 LTS |
| CPU | 2 cores |
| RAM | 4 GB |
| Disk | 40 GB |
| Network | Server with a reachable IP |

### Install Docker & Git

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
```

---

## Step 2 — Copy Code to Server

### Option A — Git clone (recommended)

```bash
sudo mkdir -p /opt/cephlon
sudo chown -R "$USER":"$USER" /opt/cephlon
git clone https://github.com/YOUR_ORG/YOUR_REPO.git /opt/cephlon/erpnext
cd /opt/cephlon/erpnext
```

> The path `/opt/cephlon/erpnext` is important — all `docker compose` commands
> must be run from inside this directory. The `.` in `docker-compose.yml` mounts
> this folder as `/workspace/erpnext-source` inside the container.

### Option B — rsync from Windows (WSL/Git Bash)

```bash
rsync -avz \
  --exclude=".venv" \
  --exclude="node_modules" \
  --exclude=".env" \
  --exclude="erpnext/public/dist" \
  /c/erpnext/ user@YOUR_SERVER_IP:/opt/cephlon/erpnext/
```

---

## Step 3 — Set the Database Password

```bash
cd /opt/cephlon/erpnext
cp .env.example .env
nano .env
```

```env
MARIADB_ROOT_PASSWORD=YourStrongPassword123!
```

Generate a strong one: `openssl rand -base64 24`

> Never commit `.env` to Git.

---

## Step 4 — Open Port 8080 in Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8080/tcp
sudo ufw enable
sudo ufw status
```

> Do NOT expose MariaDB (3306) or Redis (6379) — they stay internal to Docker.

---

## Step 5 — Start All Services

```bash
cd /opt/cephlon/erpnext

# Make sure the startup script is executable
chmod +x frappe-start.sh

docker compose up -d
docker compose ps
```

All 5 should show **Up**. The frappe container will sleep (bench not init'd yet — that's expected).

---

## Step 6 — Initialize Bench (first time only)

```bash
docker compose exec frappe bash
```

Run all of these inside the container:

```bash
# 1. Init bench
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
bench set-config -g redis_cache    redis://redis-cache:6379
bench set-config -g redis_queue    redis://redis-queue:6379
bench set-config -g redis_socketio redis://redis-queue:6379
```

---

## Step 7 — Create the Site

Still inside the container — use your **server IP** as the site name:

```bash
cd /workspace/bench

# Replace 192.168.1.100 with YOUR actual server IP
bench new-site 192.168.1.100 \
  --db-root-password 'YourStrongPassword123!' \
  --admin-password  'YourAdminPassword456!' \
  --mariadb-user-host-login-scope='%'

bench --site 192.168.1.100 install-app erpnext
bench --site 192.168.1.100 set-config developer_mode 0
bench --site 192.168.1.100 clear-cache
```

Exit the container:

```bash
exit
```

---

## Step 8 — Build Frontend Assets

```bash
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench build --app erpnext"

docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench --site 192.168.1.100 clear-cache"
```

---

## Step 9 — Start Frappe (and verify auto-start works)

Now that bench is initialized the Procfile exists. Restart the container and the
startup script will detect it and launch `bench start` automatically:

```bash
docker compose restart frappe
```

Watch it start up:

```bash
docker compose logs -f frappe
# You should see bench processes starting (web, worker, scheduler...)
```

Test the site:

```bash
curl -I http://localhost:8080
# Expected: HTTP/1.1 200 OK
```

---

## Step 10 — Open in Browser

```
http://YOUR_SERVER_IP:8080
```

- **Username:** `Administrator`
- **Password:** the `--admin-password` you set in Step 7

---

## Fixing the "Procfile does not exist" Error (Already on Server)

If you already hit this error, here is the fix:

```bash
cd /opt/cephlon/erpnext

# 1. Pull the updated files that include frappe-start.sh
git pull origin main

# 2. Make the script executable
chmod +x frappe-start.sh

# 3. Recreate the frappe container with the new command
docker compose up -d --force-recreate frappe

# 4. Go inside and run the init steps (Steps 6–8 above)
docker compose exec frappe bash
```

Run all the `bench init` / `bench new-site` commands from Steps 6 and 7, then exit and restart:

```bash
docker compose restart frappe
docker compose logs -f frappe   # watch bench start
```

---

## Deploying Code Changes

### CSS/JS only (fast)

```bash
cd /opt/cephlon/erpnext
git pull origin main
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench build --app erpnext && bench --site 192.168.1.100 clear-cache"
docker compose restart nginx
```

### Python / hooks / doctypes (full)

```bash
cd /opt/cephlon/erpnext
git pull origin main
docker compose exec -T frappe bash -lc "cd /workspace/bench && bench build --app erpnext"
docker compose exec -T frappe bash -lc "cd /workspace/bench && bench --site 192.168.1.100 migrate"
docker compose exec -T frappe bash -lc "cd /workspace/bench && bench --site 192.168.1.100 clear-cache"
docker compose restart frappe nginx
```

---

## Backup

```bash
# Database
docker compose exec -T mariadb mariadb-dump \
  -uroot -p'YourStrongPassword123!' \
  --all-databases > erpnext-db-$(date +%F).sql

# Site files
docker compose exec -T frappe bash -lc \
  "cd /workspace/bench && bench --site 192.168.1.100 backup --with-files"
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Procfile does not exist` | Bench not initialized when `bench start` runs | See "Fixing the Procfile error" section above |
| `CMD not executing in bench directory` | `working_dir` wrong or bench not init'd | Run `docker compose exec frappe bash` and check `/workspace/bench/Procfile` exists |
| Can't reach port 8080 | Firewall or container down | `sudo ufw allow 8080/tcp` + `docker compose up -d` |
| `502 Bad Gateway` | Frappe web process not running | `docker compose logs frappe` — restart after init |
| Old CSS/JS in browser | Cache not cleared | Bump `?v=N` in `hooks.py` → `bench build` → `bench clear-cache` → Ctrl+Shift+R |
| `Site not found` | IP mismatch | IP in browser must exactly match name used in `bench new-site` |
| DB auth failed | Wrong password | Check `.env` matches `docker-compose.yml` |

---

## Checklist

- [ ] Docker and Git installed on server
- [ ] `.env` created with strong password
- [ ] `.env` is in `.gitignore`
- [ ] `chmod +x frappe-start.sh` done on server
- [ ] Port `8080` open: `ufw allow 8080/tcp`
- [ ] MariaDB (3306) and Redis (6379) NOT open publicly
- [ ] `bench init` completed inside the container
- [ ] Site created with server IP as site name
- [ ] `bench build --app erpnext` completed
- [ ] `docker compose restart frappe` done after init
- [ ] App loads at `http://YOUR_SERVER_IP:8080`
- [ ] `developer_mode = 0` on the site
- [ ] Backup procedure tested
