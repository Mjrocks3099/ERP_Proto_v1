# Environment Configuration Instructions (`.env`)

This document explains what values to enter in your `.env` configuration file when deploying Cephlon ERP / ERPNext.

---

## 1. Quick Setup: Copy the Template

On your deployment server, copy `.env.example` to create your active `.env` file:

```bash
cd /opt/cephlon/erpnext
cp .env.example .env
nano .env
```

---

## 2. What to Enter for `FRAPPE_SITE` and `FRAPPE_HOST`

### Case A: Deploying with Server IP (No Domain Name)
Use this option when accessing your server via its public or local IP address on port `3011`:

```env
COMPOSE_PROJECT_NAME=cephlon-erp
MARIADB_ROOT_PASSWORD=YourStrongDatabasePassword123!
FRAPPE_SITE=192.168.1.100
FRAPPE_HOST=192.168.1.100
HTTP_PORT=3011
CEPHLON_IMAGE=cephlon/erpnext:latest
```

> [!IMPORTANT]
> Replace `192.168.1.100` with your **actual server IP address** (e.g. `64.227.12.34`).
> Both `FRAPPE_SITE` and `FRAPPE_HOST` must match this IP address.

To find your server's IP address on Linux:
```bash
hostname -I | awk '{print $1}'
# or
curl -4 ifconfig.me
```

---

### Case B: Deploying with a Domain Name
Use this option when you have a registered domain or subdomain pointing to your server:

```env
COMPOSE_PROJECT_NAME=cephlon-erp
MARIADB_ROOT_PASSWORD=YourStrongDatabasePassword123!
FRAPPE_SITE=erp.yourcompany.com
FRAPPE_HOST=erp.yourcompany.com
HTTP_PORT=3011
CEPHLON_IMAGE=cephlon/erpnext:latest
```

---

## 3. Detailed Variable Breakdown

| Variable | Recommended Value | Explanation |
|---|---|---|
| **`COMPOSE_PROJECT_NAME`** | `cephlon-erp` | The namespace prefix used by Docker for container and volume names. |
| **`MARIADB_ROOT_PASSWORD`** | A strong, secure password | The root administrative password for the MariaDB database service. Keep this private and never commit it to Git. |
| **`FRAPPE_SITE`** | Your Server IP or Domain | The internal Frappe site folder name created under `/workspace/bench/sites/`. Commands like `bench --site "$FRAPPE_SITE" migrate` use this to know which site database to manage. |
| **`FRAPPE_HOST`** | Your Server IP or Domain | The public address you type in your browser's address bar to access the app (e.g., `http://FRAPPE_HOST:3011`). |
| **`HTTP_PORT`** | `3011` | The external port exposed on your server host for Nginx web traffic. |
| **`CEPHLON_IMAGE`** | `cephlon/erpnext:latest` | The container image tag used in production Compose builds. |

---

## 4. How to Check Your Existing Site Name

If you already created a site during setup and are unsure what site name you used, run this command on your server:

```bash
docker compose exec frappe ls /workspace/bench/sites
```

Example output:
```text
192.168.1.100   apps.txt   common_site_config.json   assets
```

In the example above, your site folder is `192.168.1.100`. Therefore, in `.env`:
```env
FRAPPE_SITE=192.168.1.100
FRAPPE_HOST=192.168.1.100
```

---

## 5. Applying `.env` Changes

Whenever you modify `.env`, apply the changes to running containers:

```bash
# Recreate any services whose environment variables changed
docker compose up -d

# Restart frappe and nginx
docker compose restart frappe nginx
```

