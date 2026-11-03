# Apply Cephlon Login and Desk Customizations on a Server

This guide updates a deployed ERP_Proto_v1 server so the Cephlon login page and Desk dashboard load from the current Git checkout.

The public address for the current Compose configuration is:

~~~text
http://YOUR_SERVER_IP:3011
~~~

The site root redirects to /login. The custom CSS and JavaScript are included directly from this repository. For these direct files, a full bench build is not normally required; the server must have the correct Git revision, Bench app link, installed app, loaded hooks, and cache state.

## Before starting: the files and what they do

| File | Customization |
|---|---|
| erpnext/hooks.py | Registers login and Desk styles/scripts and their browser cache versions. |
| erpnext/public/css/cephlon-erp-login.css | Login layout, dark colors, branding panel, responsive rules. |
| erpnext/public/js/cephlon-erp-login.js | Adds the Cephlon login panel, labels, and login-page elements. |
| erpnext/public/js/cephlon-login.js | Additional login-page behavior. |
| erpnext/public/css/cephlon-dashboard-panel.css | Cephlon Desk sidebar and panel styling. |
| erpnext/public/css/cephlon-dashboard-home.css | Home banner and content visibility styles. |
| erpnext/public/js/cephlon-dashboard-home.js | Home banner, Desk branding, onboarding text, and route-render behavior. |
| erpnext/public/css/cephlon-raleway.css | Shared typography. |
| erpnext/public/images/cephlon-logo.png | Logo used on the login page and Desk. |
| docker-compose.yml | Mounts this repository at /workspace/erpnext-source and starts the Frappe container. |
| nginx/default.conf | Routes requests by IP to development.localhost and publishes the login page through Nginx. |

In the container, the repository root is /workspace/erpnext-source. The Bench app link should resolve to that path. The app hooks file is nested at:

~~~text
/workspace/bench/apps/erpnext/erpnext/hooks.py
~~~

## Step 1: publish the customized Git revision

The server can only download committed and pushed files. On the development machine, check that the files above and the current hooks.py asset references are included in the revision you intend to deploy. Commit and push any pending customization changes to the branch used by the server.

On the server, change to the existing clone:

~~~bash
cd /path/to/ERP_Proto_v1
git pull
git log -1 --oneline
~~~

If git pull says the branch is already current but it does not contain the Cephlon files or hooks references, push the correct revision from the development machine and pull again.

## Step 2: check Compose and start the services

Validate the Compose configuration and ensure the Frappe command uses Bash directly:

~~~bash
sudo docker compose config
sudo docker compose up -d
sudo docker compose ps
~~~

The resolved Frappe command should contain bash and /workspace/erpnext-source/frappe-start.sh. It should not contain a malformed bash/workspace path or a stray lc argument.

If the Compose file or Dockerfile changed in the new revision, recreate the web services; rebuild only if the image definition changed:

~~~bash
sudo docker compose up -d --build --force-recreate frappe nginx
~~~

## Step 3: check that Bench points at this checkout

Check the app link, installed apps, and the source files:

~~~bash
sudo docker compose exec -T frappe readlink -f /workspace/bench/apps/erpnext
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost list-apps
sudo docker compose exec -T frappe test -f /workspace/bench/apps/erpnext/erpnext/hooks.py
sudo docker compose exec -T frappe test -f /workspace/erpnext-source/erpnext/public/css/cephlon-erp-login.css
sudo docker compose exec -T frappe test -f /workspace/erpnext-source/erpnext/public/js/cephlon-dashboard-home.js
~~~

Expected:

- The app link resolves to /workspace/erpnext-source.
- list-apps includes erpnext.
- All test -f commands exit successfully.

If the app link is missing, link it from the repository root inside the container:

~~~bash
sudo docker compose exec -T frappe bash -lc '
if [ ! -e /workspace/bench/apps/erpnext ]; then
  ln -s /workspace/erpnext-source /workspace/bench/apps/erpnext
fi
grep -qxF erpnext /workspace/bench/sites/apps.txt || echo erpnext >> /workspace/bench/sites/apps.txt'
~~~

If the link exists but resolves to a different path, inspect it first. Only replace it if it is a symlink:

~~~bash
sudo docker compose exec -u root -T frappe bash -lc '
if [ -L /workspace/bench/apps/erpnext ]; then
  ln -sfn /workspace/erpnext-source /workspace/bench/apps/erpnext
else
  echo "apps/erpnext exists and is not a symlink; inspect it before changing it." >&2
  exit 1
fi'
~~~

If list-apps does not include erpnext, complete the first-time setup in DEPLOY.md sections 5 and 6. Do not install the app again if it is already listed.

## Step 4: fix source dependency permissions if setup requirements failed

bench setup requirements installs JavaScript dependencies into the source bind mount. If it failed with EACCES or permission denied for node_modules, create writable dependency directories as the frappe user:

~~~bash
sudo docker compose exec -u root -T frappe bash -lc 'mkdir -p /workspace/erpnext-source/node_modules /workspace/erpnext-source/banking/node_modules && chown -R frappe:frappe /workspace/erpnext-source/node_modules /workspace/erpnext-source/banking/node_modules'
~~~

Then retry requirements:

~~~bash
sudo docker compose exec -T -w /workspace/bench frappe bench setup requirements
~~~

This may take several minutes. If requirements completed successfully already, skip this step.

## Step 5: confirm hooks register the custom assets

Check the hooks file from inside the Bench link:

~~~bash
sudo docker compose exec -T frappe grep -n -E 'cephlon-erp-login|cephlon-login|cephlon-dashboard|cephlon-raleway' /workspace/bench/apps/erpnext/erpnext/hooks.py
~~~

The current customization references are:

~~~text
Login CSS:       cephlon-erp-login.css?v=8
Login branding:  cephlon-erp-login.js?v=8
Login behavior:  cephlon-login.js?v=2
Desk CSS:        cephlon-dashboard-panel.css?v=17
                 cephlon-dashboard-home.css?v=15
                 cephlon-raleway.css?v=2
Desk JavaScript: cephlon-dashboard-home.js?v=21
~~~

If the files have changed since these versions, use the versions shown in the checked-out hooks.py. When editing a custom CSS or JavaScript file in the future, increment its query-string version in hooks.py. This makes browsers request the changed file.

## Step 6: clear Frappe caches and restart web services

After confirming the Git checkout, app link, installed app, and hooks:

~~~bash
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost clear-cache
sudo docker compose restart frappe nginx
sudo docker compose ps
sudo docker compose logs --tail=60 frappe
~~~

Wait until frappe and nginx show healthy. The startup log should say Procfile ready and bench start. On a new server, Procfile not found means Bench initialization is still incomplete; finish DEPLOY.md sections 5 and 6 first.

## Step 7: verify each asset from the server

Before testing URLs, check the generated public-assets link. Frappe serves files from sites/assets; the link must resolve to the ERPNext public directory:

~~~bash
sudo docker compose exec -T frappe readlink -f /workspace/bench/sites/assets/erpnext
~~~

Expected target: /workspace/erpnext-source/erpnext/public. A 404 for every custom asset usually means this link is missing or points to the wrong directory, even when the source files exist.

If the link is missing or is a symlink to the wrong target, recreate it as the frappe user:

~~~bash
sudo docker compose exec -T frappe bash -lc 'asset_link=/workspace/bench/sites/assets/erpnext; target=/workspace/erpnext-source/erpnext/public; mkdir -p /workspace/bench/sites/assets; if [ -L "$asset_link" ] || [ ! -e "$asset_link" ]; then ln -sfn "$target" "$asset_link"; else echo "Asset path exists as a real directory; inspect it before replacing it." >&2; exit 1; fi'
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost clear-cache
sudo docker compose restart frappe nginx
~~~

Run from the server host. Every command should return HTTP 200:

~~~bash
for path in \
  '/assets/erpnext/css/cephlon-raleway.css?v=2' \
  '/assets/erpnext/css/cephlon-erp-login.css?v=8' \
  '/assets/erpnext/js/cephlon-erp-login.js?v=8' \
  '/assets/erpnext/js/cephlon-login.js?v=2' \
  '/assets/erpnext/css/cephlon-dashboard-panel.css?v=17' \
  '/assets/erpnext/css/cephlon-dashboard-home.css?v=15' \
  '/assets/erpnext/js/cephlon-dashboard-home.js?v=21'
do
  curl -fsS -o /dev/null -w '%{http_code} %{url_effective}\n' "http://127.0.0.1:3011$path" || exit 1
done
~~~

Check the login page HTML includes the custom login assets:

~~~bash
curl -fsS http://127.0.0.1:3011/login | grep -E 'cephlon-erp-login|cephlon-login'
~~~

Use the public URL from another computer:

~~~text
http://YOUR_SERVER_IP:3011/login
~~~

Sign in and open the Home workspace at /desk/setup/home to verify the dashboard banner and sidebar styling.

## Step 8: browser refresh

Once the server serves the current asset URLs, reload the browser. Use Ctrl+F5 once to discard older cached files. Future CSS/JavaScript changes should load normally after their query-string versions in hooks.py are incremented and the site cache is cleared.

## Common causes and fixes

### Login and dashboard still look like stock ERPNext

- The server has not pulled the Git revision containing the custom files.
- The Bench app link points somewhere other than /workspace/erpnext-source.
- ERPNext is not listed in bench --site development.localhost list-apps.
- The site cache or Frappe process still has old hooks loaded.
- The browser cached an old asset version.

Follow steps 1 through 8 in order. If the login HTML does not contain the Cephlon asset names, verify hooks.py and restart Frappe. If HTML includes the URLs but an asset returns 404, verify the file exists at the source path and that the app link is correct.

### Procfile not found

This is expected before the first Bench initialization. Complete DEPLOY.md sections 5 and 6 before restarting Frappe.

### Permission denied executing frappe-start.sh or bash: lc

Use the current Compose configuration from Git. It should run bash /workspace/erpnext-source/frappe-start.sh as the command, with no -lc argument. Recreate the Frappe service after pulling a changed Compose file:

~~~bash
git pull
sudo docker compose config
sudo docker compose up -d --force-recreate frappe
~~~

### EACCES creating node_modules

Use the Step 4 ownership command, then retry bench setup requirements.

### Assets return 404

A 404 means Frappe cannot find the requested path under sites/assets. Check that /workspace/bench/sites/assets/erpnext resolves to /workspace/erpnext-source/erpnext/public, that the named file exists under erpnext/public, and that hooks.py uses the same filename. If the source file exists but the assets link is missing, use the repair command in Step 7, then clear cache and restart.

### Nginx is unreachable from outside

Allow TCP 3011 through the server firewall and cloud provider firewall/security group. Compose only publishes Nginx; do not expose MariaDB or Redis.
