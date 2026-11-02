# Cephlon ERPNext Docker Development

For the complete server deployment walkthrough, see [SETUP_GUIDE.md](./SETUP_GUIDE.md).

This repository runs ERPNext and Frappe in Docker without using the external `frappe_docker` stack. The ERPNext source is mounted directly from this repository, so frontend and backend source changes can be edited in VS Code and tested in the running bench.

## Architecture

```text
Browser
  |
  v
Nginx :8080
  |
  v
Frappe web process :8000  <-->  MariaDB :3306
          |                  
          +---------------> Redis cache :6379
          +---------------> Redis queue :6379

Windows workspace C:/erpnext
  -> /workspace/erpnext-source in the frappe container
  -> /workspace/bench/apps/erpnext through a symlink
```

The services are defined in [docker-compose.yml](./docker-compose.yml):

- `nginx`: gateway exposed at `http://development.localhost:8080`
- `frappe`: Bench container containing Frappe, the bench, and the editable ERPNext app
- `mariadb`: ERPNext database
- `redis-cache`: cache backend
- `redis-queue`: background job queue
- `bench-data`: persistent bench, site, and generated asset volume
- `mariadb-data`: persistent database volume

## First-time setup

Prerequisites:

- Docker Desktop running with Linux containers enabled
- PowerShell
- This repository at `C:\erpnext`

From PowerShell:

```powershell
Set-Location C:\erpnext
.\docker-setup.ps1
```

The script starts MariaDB, Redis, the Frappe container, and Nginx. It then initializes the bench, links the editable ERPNext source, creates `development.localhost`, installs ERPNext, and starts Frappe.

Open:

```text
http://development.localhost:8080
```

Development credentials created by the setup script:

```text
User:     Administrator
Password: admin
```

## Daily start and stop

Start the existing containers:

```powershell
docker compose up -d
```

Check service status:

```powershell
docker compose ps
```

Stop containers while keeping data:

```powershell
docker compose stop
```

Start them again:

```powershell
docker compose start
```

Do not use `docker compose down -v` unless you intentionally want to delete the MariaDB and bench volumes.

## Making source changes

The editable ERPNext application is the repository folder itself:

```text
erpnext/
  hooks.py                         App metadata and asset includes
  public/css/                      Custom CSS assets
  public/js/                       Custom JavaScript assets
  public/images/                   Brand images
  templates/                       Server-rendered templates
  erpnext/doctype/                 ERPNext Python doctypes
```

Current Cephlon customization files:

- [erpnext/hooks.py](./erpnext/hooks.py): app name, logo, and asset registration
- [erpnext/public/css/cephlon-erp-login.css](./erpnext/public/css/cephlon-erp-login.css): responsive login styling
- [erpnext/public/js/cephlon-erp-login.js](./erpnext/public/js/cephlon-erp-login.js): login labels and branding panel
- [erpnext/public/css/cephlon-dashboard-panel.css](./erpnext/public/css/cephlon-dashboard-panel.css): C-dot navigation panel and orange dashboard hover accents
- [erpnext/public/images/cephlon-logo.png](./erpnext/public/images/cephlon-logo.png): Cephlon logo asset

Edit files in VS Code, then rebuild assets and clear the site cache:

```powershell
docker compose exec -T frappe bash -lc "cd /workspace/bench && bench build --app erpnext"
docker compose exec -T -w /workspace/bench frappe bench --site development.localhost clear-cache
```

If a build reports the existing Banking/Vite `common_site_config.json` error after `Application Assets Linked`, the custom direct CSS and JavaScript assets are still served. Check the browser with a hard refresh (`Ctrl+F5`) and confirm the asset URL version in `hooks.py` was incremented when needed.

## Adding or changing frontend assets

When a CSS or JavaScript file is changed:

1. Edit the source file under `erpnext/public`.
2. Register it in [hooks.py](./erpnext/hooks.py) if it is new.
3. Increment its query-string version, for example `?v=5`, to bypass browser caching.
4. Run `bench build --app erpnext`.
5. Run `bench --site development.localhost clear-cache`.
6. Hard-refresh the browser.

The login assets are registered as `web_include_css` and `web_include_js`. The dashboard panel asset is registered as `app_include_css` and is loaded by the Desk interface.

## Docker deployment workflow

For a development or internal server using this compose file:

1. Copy the repository to the server.
2. Install Docker Engine or Docker Desktop and enable Compose.
3. Review the passwords and exposed ports in [docker-compose.yml](./docker-compose.yml) before starting.
4. Start the stack with `docker compose up -d`.
5. Run `docker-setup.ps1` on Windows, or execute the equivalent commands inside the `frappe` container on Linux.
6. Build assets after every frontend source change.
7. Place a TLS reverse proxy in front of Nginx for a public deployment.
8. Back up the `mariadb-data` and `bench-data` volumes.

This compose file is a development-oriented source-mounted setup. For production, use strong secrets, a managed or hardened database, TLS, backups, monitoring, restricted ports, and a process/restart policy. Do not expose MariaDB or Redis directly to the public internet.

## Useful commands

Open a shell in the Frappe container:

```powershell
docker compose exec frappe bash
```

Run a Bench command:

```powershell
docker compose exec -T -w /workspace/bench frappe bench --site development.localhost list-apps
```

View Frappe logs:

```powershell
docker compose logs -f frappe
```

View Nginx logs:

```powershell
docker compose logs -f nginx
```

Restart the Frappe process without deleting data:

```powershell
docker compose restart frappe nginx
```

## Important paths

```text
C:\erpnext\docker-compose.yml       Docker services and volumes
C:\erpnext\docker-setup.ps1        Initial bench/site setup
C:\erpnext\nginx\default.conf     Nginx gateway configuration
C:\erpnext\erpnext\hooks.py       ERPNext app configuration
C:\erpnext\erpnext\public\        Editable browser assets
```
