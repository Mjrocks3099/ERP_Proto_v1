# Troubleshooting & Fix Guide: 502 Bad Gateway on IP:3011 / IP:8080

This guide details why the **502 Bad Gateway** error occurs after running the deployment guide ([`DEPLOY.md`](./DEPLOY.md)) and provides complete, copy-paste solutions to fix it.

---

## What 502 Bad Gateway Means

In this deployment architecture:
```text
Browser ──▶ http://YOUR_SERVER_IP:3011 (or 8080)
                 │
                 ▼
         Nginx Container (:80)
                 │
                 ▼ (proxy_pass http://frappe:8000)
         Frappe Container (:8000)  [FAILED / NOT LISTENING]
```

- **Nginx is working properly:** It received your request.
- **The Frappe backend is down or unreachable:** Nginx tried to forward traffic to `http://frappe:8000`, but received `Connection refused` or no response.

---

## Step 1: Quick 10-Second Diagnosis

Run these commands on your host server inside the `/opt/cephlon/erpnext` directory:

```bash
# 1. Check container statuses
docker compose ps

# 2. Inspect recent Frappe container logs
docker compose logs --tail=60 frappe
```

Compare the log output with the common causes below.

---

## Common Causes & Immediate Fixes

### Cause 1: Bench is not initialized yet (Container in `sleep infinity`)

#### Diagnosis
In `docker compose logs frappe`, you see:
```text
[cephlon-start] Procfile not found at /workspace/bench/Procfile
[cephlon-start] Bench is not initialized yet.
[cephlon-start] Run the initialization steps first, then restart this container.
[cephlon-start] Keeping container alive with sleep infinity...
```

#### Why it happens
When `docker compose up -d` runs for the first time, [`frappe-start.sh`](./frappe-start.sh) detects that `Procfile` does not exist yet. It puts the container to sleep so it remains alive while you run the initial setup. Because bench is sleeping, port `8000` is closed.

#### Complete Solution
Run the initialization steps inside the container:

```bash
# 1. Ensure correct file ownership for UID 1000 (frappe)
docker compose exec --user root frappe bash -c \
  "chown -R frappe:frappe /workspace/bench /workspace/erpnext-source"

# 2. Open an interactive shell inside the frappe container
docker compose exec --user frappe frappe bash
```

Inside the container, run:
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

# Create your site (replace YOUR_SERVER_IP and passwords)
bench new-site YOUR_SERVER_IP \
  --db-host mariadb \
  --db-type mariadb \
  --db-root-username root \
  --db-root-password 'YourStrongPassword123!' \
  --admin-password  'YourAdminPassword456!' \
  --mariadb-user-host-login-scope='%'

# Install erpnext into site and set default site
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
You should now see `Procfile found. Starting bench...` and services listening on `:8000`.

---

### Cause 2: Setup was completed, but `frappe` was not restarted

#### Diagnosis
You ran all commands inside the container, but Nginx still returns 502.

#### Why it happens
The original container entrypoint process is still running `sleep infinity`. It does not automatically run `bench start` until restarted.

#### Solution
```bash
docker compose restart frappe
docker compose logs -f frappe
```

---

### Cause 3: Port 3011 Mismatch / Configuration

#### Diagnosis
You are trying to access `http://YOUR_SERVER_IP:3011`, but [`docker-compose.yml`](./docker-compose.yml) defaults to `8080:80`.

#### Solutions

- **If you want the app on port 3011 directly via Docker:**
  Edit [`docker-compose.yml`](./docker-compose.yml) under `nginx`:
  ```yaml
    nginx:
      image: nginx:alpine
      restart: unless-stopped
      depends_on:
        - frappe
      ports:
        - "3011:80"    # Changed from 8080:80
  ```
  Apply changes:
  ```bash
  docker compose up -d nginx
  ```
  Open firewall port:
  ```bash
  sudo ufw allow 3011/tcp
  ```

- **If you are using a host reverse proxy (system Nginx/Traefik) on port 3011:**
  Ensure the host proxy forwards to `http://127.0.0.1:8080` (the Nginx container) and passes the host headers:
  ```nginx
  server {
      listen 3011;
      server_name _;

      location / {
          proxy_pass http://127.0.0.1:8080;
          proxy_http_version 1.1;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
  ```

- **If you did not intentionally change ports:**
  Access the application on the default port:
  ```text
  http://YOUR_SERVER_IP:8080
  ```

---

### Cause 4: MariaDB or Redis Connection Failure

#### Diagnosis
In `docker compose logs frappe`, you see errors such as:
- `redis.exceptions.ConnectionError: Error connecting to localhost:6379`
- `OperationalError: (2002, "Can't connect to local server through socket '/run/mysqld/mysqld.sock'")`

#### Why it happens
Frappe is trying to connect to `localhost` inside its own container instead of Docker's network hostnames `mariadb`, `redis-cache`, and `redis-queue`.

#### Solution
Check the content of `/workspace/bench/sites/common_site_config.json`:
```bash
docker compose exec --user frappe frappe bash -c "cat /workspace/bench/sites/common_site_config.json"
```

If the docker hostnames are missing, set them:
```bash
docker compose exec --user frappe frappe bash -lc \
  "cd /workspace/bench && \
   bench set-config -g db_host mariadb && \
   bench set-config -g redis_cache redis://redis-cache:6379 && \
   bench set-config -g redis_queue redis://redis-queue:6379 && \
   bench set-config -g redis_socketio redis://redis-queue:6379"

docker compose restart frappe
```

---

### Cause 5: Multi-Tenant Site Resolution (HTTP 404 / 502)

#### Diagnosis
When opening `http://YOUR_SERVER_IP:3011`, Frappe cannot determine which site to load because the incoming `Host` header doesn't match a folder in `/workspace/bench/sites/`.

#### Solution
Set the default site globally in bench so any incoming IP/domain routes to your site:
```bash
docker compose exec --user frappe frappe bash -lc \
  "cd /workspace/bench && bench set-config -g default_site YOUR_SERVER_IP"
```
*(Replace `YOUR_SERVER_IP` with the exact site name you created in `bench new-site`, or `$(hostname -I | awk '{print $1}')`)*

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
   # If using port 3011:
   curl -I http://127.0.0.1:3011

   # If using port 8080:
   curl -I http://127.0.0.1:8080
   ```
   Should return `HTTP/1.1 200 OK` or `302 FOUND`.

4. **Access in your browser:**
   ```text
   http://YOUR_SERVER_IP:3011
   # or
   http://YOUR_SERVER_IP:8080
   ```

