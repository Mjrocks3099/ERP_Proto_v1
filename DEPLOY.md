# Cephlon ERP — Server Deployment Guide (IP + Port)

Access the app at:  **`http://YOUR_SERVER_IP:8080`**

No domain name or HTTPS needed.

---

## How the Startup Works

```
First run (bench not initialized):
  frappe-start.sh → Procfile NOT found → sleep infinity (container stays alive)
  → You fix permissions (chown to frappe:frappe)
  → You run bench init steps
  → docker compose restart frappe
  → frappe-start.sh → Procfile FOUND → bench start ✅

Every restart after that:
  frappe-start.sh → Procfile FOUND → bench start ✅ (fully automatic)
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
| [`docker-compose.yml`](./docker-compose.yml) | All services — Nginx exposes port `8080`, Frappe runs with `user: frappe` |
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
| OS | Ubuntu 22.04 LTS / 24.04 LTS |
| CPU | 2 cores |
| RAM | 4 GB |
| Disk | 40 GB |
| Network | Server with reachable IP |

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

```bash
sudo mkdir -p /opt/cephlon
sudo chown -R "$USER":"$USER" /opt/cephlon
git clone https://github.com/YOUR_ORG/YOUR_REPO.git /opt/cephlon/erpnext
cd /opt/cephlon/erpnext
```

---

## Step 3 — Set Database Password

```bash
cd /opt/cephlon/erpnext
cp .env.example .env
nano .env
```

Set:
```env
MARIADB_ROOT_PASSWORD=YourStrongPassword123!
```

---

## Step 4 — Open Port 8080 in Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8080/tcp
sudo ufw enable
sudo ufw status
```

---

## Step 5 — Make Script Executable & Start Containers

```bash
cd /opt/cephlon/erpnext
chmod +x frappe-start.sh

docker compose up -d
docker compose ps
```

---

## Step 6 — Fix Permissions (CRITICAL STEP)

> [!IMPORTANT]
> The container runs as user `frappe` (UID 1000). Both `/workspace/bench` and `/workspace/erpnext-source` **must** be owned by `frappe` so yarn/pip can create folders like `node_modules` without `EACCES: permission denied` errors.

Run this command from the host server:

```bash
docker compose exec --user root frappe bash -c \
  "chown -R frappe:frappe /workspace/bench /workspace/erpnext-source"
```

*(Optional alternative directly on host: `sudo chown -R 1000:1000 /opt/cephlon/erpnext`)*

---

## Step 7 — Initialize Bench (first time only)

Now enter the container as the **`frappe`** user:

```bash
docker compose exec --user frappe frappe bash
```

Run these commands inside the container:

```bash
# 1. Initialize bench if not already done
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

# 3. Safe git directory
git config --global --add safe.directory /workspace/erpnext-source

# 4. Install Python and Node dependencies
cd /workspace/bench
bench setup requirements

# 5. Point bench to Docker service hostnames
bench set-config -g db_host mariadb
bench set-config -g redis_cache    redis://redis-cache:6379
bench set-config -g redis_queue    redis://redis-queue:6379
bench set-config -g redis_socketio redis://redis-queue:6379
```

---

## Step 8 — Create the Site

Still inside the container (replace `192.168.1.100` with your **server IP**):

```bash
cd /workspace/bench

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

## Step 9 — Build Frontend Assets

Run from the host:

```bash
docker compose exec --user frappe -T frappe bash -lc \
  "cd /workspace/bench && bench build --app erpnext"

docker compose exec --user frappe -T frappe bash -lc \
  "cd /workspace/bench && bench --site 192.168.1.100 clear-cache"
```

---

## Step 10 — Restart Frappe & Verify

```bash
docker compose restart frappe
docker compose logs -f frappe
```

You should see bench starting (web server on `:8000`, worker, socketio).

Check with curl:

```bash
curl -I http://localhost:8080
```

---

## Step 11 — Open in Browser

Open in your browser:

```
http://YOUR_SERVER_IP:8080
```

- **Username:** `Administrator`
- **Password:** the `--admin-password` you set in Step 8

---

## 🛠️ Quick Troubleshooting Guide

### 1. `EACCES: permission denied, mkdir '/workspace/erpnext-source/node_modules'` or yarn error
**Cause:** Host files mounted as root instead of user `frappe` (UID 1000).  
**Fix:** Run on the server:
```bash
docker compose exec --user root frappe bash -c "chown -R frappe:frappe /workspace/bench /workspace/erpnext-source"
```
Or on the host:
```bash
sudo chown -R 1000:1000 /opt/cephlon/erpnext
```

### 2. `Procfile does not exist or is not a file`
**Cause:** `bench start` executed before `bench init`.  
**Fix:** `frappe-start.sh` now handles this automatically. Follow Steps 6–8 to complete `bench init`, then run `docker compose restart frappe`.

### 3. `Permission denied: '/workspace/bench/apps'`
**Cause:** `bench-data` volume owned by `root`.  
**Fix:** 
```bash
docker compose exec --user root frappe bash -c "chown -R frappe:frappe /workspace/bench"
```

---

## Deploying Future Updates

```bash
cd /opt/cephlon/erpnext
git pull origin main

# Rebuild assets and clear cache
docker compose exec --user frappe -T frappe bash -lc \
  "cd /workspace/bench && bench build --app erpnext && bench --site 192.168.1.100 clear-cache"

# If Python/Doctype changes occurred:
docker compose exec --user frappe -T frappe bash -lc \
  "cd /workspace/bench && bench --site 192.168.1.100 migrate"

docker compose restart frappe nginx
```
