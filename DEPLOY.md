# ERP_Proto_v1 Docker Server Deployment

This guide deploys the repository on Ubuntu and exposes ERPNext on the server public IP at TCP port 3011.

Example: http://203.0.113.10:3011

The Compose stack builds Frappe from Dockerfile.cephlon, runs MariaDB and Redis privately, and publishes Nginx. Nginx routes public-IP requests to the site named development.localhost. Opening the root redirects to /login.

> This is a development-oriented stack. It uses the Frappe develop branch, the mutable frappe/bench:latest image, editable source mounts, and plain HTTP. Restrict access with a firewall. Before sensitive production use, add TLS, pin versions, use a production process manager, and establish tested off-server backups.

## 1. Server requirements

Use Ubuntu 22.04 or 24.04 with:

- Public IPv4, or private IP reachable over VPN.
- Suggested minimum: 4 CPU cores, 8 GB RAM, 50 GB free disk. The first build and app install take time and resources.
- SSH and sudo access.
- Outbound internet to download Docker images and Frappe dependencies.
- Inbound TCP 3011 allowed by both host and cloud provider firewalls.

Install Docker Engine and Compose using Docker's current instructions:

- https://docs.docker.com/engine/install/ubuntu/
- https://docs.docker.com/compose/install/linux/
- https://docs.docker.com/engine/install/linux-postinstall/

Verify:

~~~bash
sudo docker version
sudo docker compose version
sudo systemctl enable --now docker
~~~

The docker group grants root-level privileges. This guide uses sudo for Docker commands.

## 2. Clone the complete Git repository

A server clone only contains committed and pushed files. Ensure the revision being deployed contains the deployment files and customizations in section 10.

Replace the example URL with your actual Git URL:

~~~bash
sudo mkdir -p /opt/cephlon
sudo chown "$USER":"$USER" /opt/cephlon
git clone YOUR_GIT_REPOSITORY_URL /opt/cephlon/ERP_Proto_v1
cd /opt/cephlon/ERP_Proto_v1
~~~

Configure Git authentication first if the repository is private. Do not put a personal access token in the repository URL or this guide.

Confirm the required files exist:

~~~bash
test -f docker-compose.yml
test -f Dockerfile.cephlon
test -f frappe-start.sh
test -f nginx/default.conf
~~~

## 3. Configure secrets and port

Create a server-only .env in the repository root. Compose reads MARIADB_ROOT_PASSWORD and HTTP_PORT. Never commit .env.

~~~bash
openssl rand -hex 32
nano .env
~~~

Paste the generated value:

~~~dotenv
MARIADB_ROOT_PASSWORD=PASTE_LONG_RANDOM_VALUE_HERE
HTTP_PORT=3011
~~~

Save and restrict permissions:

~~~bash
chmod 600 .env
~~~

Keep the database password available for section 6. Choose a separate strong ERPNext Administrator password and store both in a password manager.

3011 is the default public port. For a different port, change HTTP_PORT, allow it through both firewalls, and use it in the browser URL. Nginx listens on port 80 inside the container.

## 4. Build and start Docker

From the repository directory:

~~~bash
sudo docker compose config
sudo docker compose up -d --build
sudo docker compose ps
~~~

The first build pulls frappe/bench and may take several minutes. Expected services: mariadb, redis-cache, redis-queue, frappe, nginx.

Data is stored in named Docker volumes. On a fresh install, make the bench volume writable by the frappe container user:

~~~bash
sudo docker compose exec -u root frappe chown -R frappe:frappe /workspace/bench
~~~

Wait until MariaDB is healthy with docker compose ps. Frappe may be running but idle until Bench is initialized; frappe-start.sh waits for the Bench Procfile.

## 5. Initialize Bench and link this ERPNext source

Run these from the repository root. They execute inside the Frappe container as frappe.

Initialize Bench and download Frappe develop:

~~~bash
sudo docker compose exec -T frappe bash -lc '
if [ ! -f /workspace/bench/apps/frappe/pyproject.toml ]; then
  bench init --ignore-exist --skip-redis-config-generation --frappe-branch develop /workspace/bench
fi'
~~~

Link the app source from this repository and register it in apps.txt:

~~~bash
sudo docker compose exec -T frappe bash -lc '
if [ ! -e /workspace/bench/apps/erpnext ]; then
  ln -s /workspace/erpnext-source /workspace/bench/apps/erpnext
fi
if ! grep -qxF erpnext /workspace/bench/sites/apps.txt 2>/dev/null; then
  printf "\n" >> /workspace/bench/sites/apps.txt
  echo erpnext >> /workspace/bench/sites/apps.txt
fi
git config --global --add safe.directory /workspace/erpnext-source'
~~~

Install Python and JavaScript requirements and prepare app assets. This may use substantial CPU, memory, disk, and network bandwidth:

~~~bash
sudo docker compose exec -T -w /workspace/bench frappe bench setup requirements
~~~

Configure the database and Redis service names:

~~~bash
sudo docker compose exec -T -w /workspace/bench frappe bench set-config -g db_host mariadb
sudo docker compose exec -T -w /workspace/bench frappe bench set-config -g redis_cache redis://redis-cache:6379
sudo docker compose exec -T -w /workspace/bench frappe bench set-config -g redis_queue redis://redis-queue:6379
sudo docker compose exec -T -w /workspace/bench frappe bench set-config -g redis_socketio redis://redis-queue:6379
~~~

## 6. Create the site and install ERPNext

The site hostname is development.localhost because nginx/default.conf forwards public-IP requests to that host internally. Keep this site name unless you also update Nginx and intentionally migrate the site.

Load the database password from .env and enter a separate Administrator password:

~~~bash
set -a
. ./.env
set +a
read -rsp "Choose ERPNext Administrator password: " ERP_ADMIN_PASSWORD
printf "\n"
~~~

Create the site. Docker Compose passes the secrets to this one-time command; they are not written into the image:

~~~bash
sudo docker compose exec -T \
  -e MARIADB_ROOT_PASSWORD="$MARIADB_ROOT_PASSWORD" \
  -e ERP_ADMIN_PASSWORD="$ERP_ADMIN_PASSWORD" \
  frappe bash -lc '
cd /workspace/bench
if [ ! -d sites/development.localhost ]; then
  bench new-site \
    --db-root-password "$MARIADB_ROOT_PASSWORD" \
    --admin-password "$ERP_ADMIN_PASSWORD" \
    --mariadb-user-host-login-scope=% \
    development.localhost
fi'
~~~

Install ERPNext, disable developer mode for server access, and clear the site cache:

~~~bash
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost set-config developer_mode 0
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost install-app erpnext
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost clear-cache
~~~

If install-app reports ERPNext is already installed, skip that command.

## 7. Start and access the site

Restart Frappe after creating the site and Procfile:

~~~bash
sudo docker compose restart frappe
sudo docker compose ps
sudo docker compose logs --tail=100 frappe
~~~

When services are healthy, open:

~~~text
http://YOUR_SERVER_PUBLIC_IP:3011
~~~

The root redirects to:

~~~text
http://YOUR_SERVER_PUBLIC_IP:3011/login
~~~

Sign in as Administrator using the password entered in section 6.

Compose publishes only Nginx. MariaDB, Redis, Frappe web, and Socket.IO remain on private Docker networks.

## 8. Allow the public port

Allow SSH before enabling UFW. Replace 3011 if HTTP_PORT was changed:

~~~bash
sudo ufw allow OpenSSH
sudo ufw allow 3011/tcp
sudo ufw enable
sudo ufw status
~~~

Also allow inbound TCP 3011 in the cloud provider firewall/security group. If behind a router, forward the port to this server.

Test from another machine:

~~~bash
curl -I http://YOUR_SERVER_PUBLIC_IP:3011/login
~~~

Expected result: HTTP 200. The root URL may return a redirect to /login.

## 9. Routine operations and backups

Run from the repository directory:

~~~bash
sudo docker compose ps
sudo docker compose logs -f frappe
sudo docker compose logs -f nginx
sudo docker compose restart frappe nginx
sudo docker compose stop
sudo docker compose start
~~~

stop keeps data. Do not run docker compose down -v unless you intentionally want to delete the database and bench volumes.

Check installed apps:

~~~bash
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost list-apps
~~~

Create a database and files backup:

~~~bash
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost backup --with-files
~~~

Bench stores backups under the site's private/backups directory in the persistent bench volume. Copy backups off the server and test restores. Back up both MariaDB and bench volumes before upgrades.

For a reviewed source update, back up first, then:

~~~bash
git pull
sudo docker compose up -d --build
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost migrate
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost clear-cache
sudo docker compose restart frappe nginx
~~~

Cephlon CSS and JavaScript are included directly by hooks.py. After editing one, increment its query-string version in hooks.py, clear the site cache, and restart Frappe. A full bench build is generally unnecessary for these direct files. Rebuild and inspect output when changing bundled assets or app dependencies.

## 10. Deployment and customization file map

These files define the current deployment and Cephlon UI behavior:

| File | Purpose |
|---|---|
| Dockerfile.cephlon | Builds Frappe from docker.io/frappe/bench:latest. Required by Compose. |
| docker-compose.yml | MariaDB, Redis, Frappe, Nginx, persistent volumes, private networks, health checks, and public HTTP_PORT mapping. |
| .env | Server-only MARIADB_ROOT_PASSWORD and HTTP_PORT. Never commit it. |
| frappe-start.sh | Starts bench start once Procfile exists and binds web to the container network. Keep Unix LF line endings. |
| nginx/default.conf | Routes IP requests to development.localhost, proxies Socket.IO, provides a health response, and redirects / to /login. |
| docker-setup.ps1 | Windows first-time helper. This guide uses equivalent Linux commands on Ubuntu. |
| erpnext/hooks.py | Registers custom login and Desk assets. Query versions invalidate browser caches after asset edits. |
| erpnext/public/css/cephlon-erp-login.css | Login layout, dark theme, branding panel, and responsive styles. |
| erpnext/public/css/cephlon-dashboard-panel.css | Cephlon Desk sidebar and panel appearance. |
| erpnext/public/css/cephlon-dashboard-home.css | Home banner and initial UI visibility styles. |
| erpnext/public/css/cephlon-raleway.css | Shared Cephlon typography. |
| erpnext/public/js/cephlon-erp-login.js | Creates the login branding panel and labels. |
| erpnext/public/js/cephlon-login.js | Additional login-page behavior. |
| erpnext/public/js/cephlon-dashboard-home.js | Home banner, Cephlon text, sidebar branding, and route-render handling. |
| erpnext/public/images/cephlon-logo.png | Logo used by login and Desk customizations. |
| DEPLOY.md | This server guide and file map. |

## 11. Troubleshooting

### 502 Bad Gateway

~~~bash
sudo docker compose ps
sudo docker compose logs --tail=150 frappe
~~~

If the site is not initialized, complete sections 5 and 6, then restart Frappe. Ensure MariaDB is healthy before running new-site.

### Permission denied under /workspace/bench

Repair ownership and retry the failed Bench command:

~~~bash
sudo docker compose exec -u root frappe chown -R frappe:frappe /workspace/bench
~~~

Do not delete volumes to solve a permission problem.

### Works locally but not over the Internet

Check public IP, host firewall, provider firewall/security group, and HTTP_PORT:

~~~bash
sudo docker compose ps
sudo ufw status
~~~

Only Nginx should publish a host port.

### Stale login or customized UI

Confirm hooks.py references and custom asset URLs return HTTP 200. Clear the site cache, restart Frappe, and reload the page. Increment the asset URL version after each custom CSS or JavaScript edit.

### Nginx unhealthy

~~~bash
sudo docker compose logs --tail=100 nginx
sudo docker compose exec -T nginx nginx -t
~~~

## 12. Security and production notes

This deployment exposes plain HTTP on port 3011, mounts editable source, uses mutable development versions, and starts Bench's development process. Use it for controlled development or an internal pilot with restricted firewall access.

For an Internet-facing production system:

- Add TLS and HTTPS.
- Restrict access until TLS and access policies are ready.
- Pin Frappe, ERPNext, and image versions to reviewed releases; develop and latest are not reproducible.
- Use strong, unique database and Administrator passwords.
- Keep .env and backups out of Git.
- Configure automated off-server backups, monitoring, log retention, and tested restores.
- Use a production process manager and review resource limits and firewall policy.

Never expose MariaDB or Redis ports publicly.
