# Troubleshooting & Fix Guide: 502 Bad Gateway on IP:3011

This guide details why the **502 Bad Gateway** error occurs after running the deployment guide ([`DEPLOY.md`](./DEPLOY.md)) and provides complete, copy-paste solutions to fix it.

---

## ⚡ Quick 1-Command Automated Fix

If you have already pulled the latest repository on your server, simply run the automated fix script:

```bash
cd /opt/cephlon/erpnext
chmod +x scripts/fix-502.sh
./scripts/fix-502.sh
```

This script automatically:
1. Fixes file permissions for user `frappe`.
2. Verifies whether `Procfile` exists.
3. Fixes `Procfile` so `bench serve` binds to `0.0.0.0` (instead of `127.0.0.1`, which was blocking Nginx).
4. Verifies MariaDB & Redis hostnames.
5. Sets `default_site` in bench.
6. Restarts `frappe` and `nginx` and verifies connectivity on port `3011`.

---

## What 502 Bad Gateway Means

In this deployment architecture:
```text
Browser ──▶ http://YOUR_SERVER_IP:3011
                 │
                 ▼
         Nginx Container (:80)
                 │
                 ▼ (proxy_pass http://frappe:8000)
         Frappe Container (:8000)  [FAILED / NOT LISTENING]
```

- **Nginx is working properly:** It received your request on port 3011.
- **The Frappe backend is down or unreachable:** Nginx tried to forward traffic to `http://frappe:8000`, but received `Connection refused` or no response.

---

## Step 1: Check Container Status & Logs

Run these commands on your host server inside `/opt/cephlon/erpnext`:

```bash
# 1. Check container statuses
docker compose ps

# 2. Inspect recent Frappe container logs
docker compose logs --tail=60 frappe
```

---

## The 3 Most Common Causes & Exact Fixes

### 1. Web server was binding to `127.0.0.1` instead of `0.0.0.0`

#### Why it happens
When `bench init` generates `Procfile`, it creates:
```text
web: bench serve --port 8000
```
By default, this binds to `127.0.0.1:8000` inside the Frappe container. Because Nginx is in a **separate container**, Nginx cannot connect to `127.0.0.1` of another container, resulting in **502 Bad Gateway**.

#### Fix
Run this one command on the server to patch `Procfile` and restart:
```bash
docker compose exec --user frappe -T frappe bash -c \
  "sed -i 's/bench serve  *--port 8000/bench serve --host 0.0.0.0 --port 8000/' /workspace/bench/Procfile"

docker compose restart frappe
docker compose logs -f frappe
```
*(This fix is also now automated in [`frappe-start.sh`](./frappe-start.sh)).*

---

### 2. Bench was not initialized yet (Container in `sleep infinity`)

#### Diagnosis
In `docker compose logs frappe`, you see:
```text
[cephlon-start] Procfile not found at /workspace/bench/Procfile
[cephlon-start] Bench is not initialized yet.
[cephlon-start] Run the initialization steps first, then restart this container.
[cephlon-start] Keeping container alive with sleep infinity...
```

#### Why it happens
When `docker compose up -d` runs for the first time, bench is not initialized yet. The container sleeps so it stays alive while you run the initial setup. Because bench is sleeping, port `8000` is closed.

#### Complete Solution
Run the initialization steps inside the container:

```bash
# 1. Ensure correct file ownership for UID 1000 (frappe)
docker compose exec --user root frappe bash -c \
  "chown -R frappe:frappe /workspace/bench /workspace/erpnext-source"

# 2. Open an interactive shell inside the frappe container
docker compose exec --user frappe frappe bash
```

Inside the container:
```bash
# Initialize bench if missing
if [ ! -f /workspace/bench/apps/frappe/pyproject.toml ]; then
  bench init --ignore-exist --skip-redis-config-generation \
    --frappe-branch develop /workspace/bench
fi

# Link ERPNext app
if [ ! -e /workspace/bench/apps/erpnext ]; then
  ln -s /workspace/erpnext-source /workspace/bench/apps/erpnext
fi
grep -qxF erpnext /workspace/bench/sites/apps.txt 2>/dev/null \
  || echo erpnext >> /workspace/bench/sites/apps.txt

# Safe git directory
git config --global --add safe.directory /workspace/erpnext-source

# Install requirements
cd /workspace/bench
bench setup requirements

# Point bench to dockerized Redis and MariaDB services
bench set-config -g db_host mariadb
bench set-config -g redis_cache    redis://redis-cache:6379
bench set-config -g redis_queue    redis://redis-queue:6379
bench set-config -g redis_socketio redis://redis-queue:6379

# Bind web server to 0.0.0.0 so Nginx can connect
sed -i 's/bench serve  *--port 8000/bench serve --host 0.0.0.0 --port 8000/' /workspace/bench/Procfile

# Create your site (replace YOUR_SERVER_IP and passwords)
bench new-site YOUR_SERVER_IP \
  --db-host mariadb \
  --db-type mariadb \
  --db-root-username root \
  --db-root-password 'YourStrongPassword123!' \
  --admin-password  'YourAdminPassword456!' \
  --mariadb-user-host-login-scope='%'

# Install erpnext and set as default site
bench --site YOUR_SERVER_IP install-app erpnext
bench set-config -g default_site YOUR_SERVER_IP

# Build assets
bench build --app erpnext

# Exit the container
exit
```

Now restart the `frappe` service to trigger `bench start`:
```bash
docker compose restart frappe
docker compose logs -f frappe
```

---

### 3. Setup was completed, but `frappe` was not restarted

#### Diagnosis
You executed `bench new-site` inside the container, but Nginx still returns 502.

#### Why it happens
The original container entrypoint process is still running `sleep infinity`. It does not automatically run `bench start` until restarted.

#### Solution
```bash
docker compose restart frappe
docker compose logs -f frappe
```
You should see:
```text
[cephlon-start] Procfile found. Starting bench...
web.1      |  * Running on all addresses (0.0.0.0)
web.1      |  * Running on http://127.0.0.1:8000
```

---

## Port 3011 Configuration

[`docker-compose.yml`](./docker-compose.yml) is now configured to expose port **`3011`**:
```yaml
  nginx:
    ports:
      - "${HTTP_PORT:-3011}:80"
```

To apply changes:
```bash
docker compose up -d nginx
```

Make sure port 3011 is allowed in your server firewall:
```bash
sudo ufw allow 3011/tcp
```

---

## Verification Checklist

1. **Verify all services are up:**
   ```bash
   docker compose ps
   ```
   All services (`mariadb`, `redis-cache`, `redis-queue`, `frappe`, `nginx`) should report `Up`.

2. **Test Frappe internal response:**
   ```bash
   docker compose exec frappe curl -I http://127.0.0.1:8000
   ```
   Should return an HTTP response (200, 302, or 404), **not** connection refused.

3. **Test Nginx endpoint from server host:**
   ```bash
   curl -I http://127.0.0.1:3011
   ```
   Should return `HTTP/1.1 200 OK` or `302 FOUND`.

4. **Access in your browser:**
   ```text
   http://YOUR_SERVER_IP:3011
   ```
