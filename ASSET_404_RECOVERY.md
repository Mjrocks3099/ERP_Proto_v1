# Recover Cephlon Assets Returning HTTP 404

Use this guide when the Cephlon files exist in the Git checkout but URLs such as /assets/erpnext/css/cephlon-raleway.css return HTTP 404.

## What the reported output means

The source checkout contains:

~~~text
/workspace/erpnext-source/erpnext/public/css/cephlon-raleway.css
~~~

But Frappe serves app files through its generated public-assets directory:

~~~text
/workspace/bench/sites/assets/erpnext/css/cephlon-raleway.css
~~~

The reported error says the second path is missing while the first exists. This means the app's public-assets link is missing, broken, or points to the wrong directory. The login and Desk customizations cannot load until Frappe can resolve the asset URLs.

The correct URL path is /assets/... . The spelling /assests/... is incorrect and returns 404.

## 1. Check the source and generated asset link

Run these from the server repository directory:

~~~bash
sudo docker compose exec -T frappe readlink -f /workspace/bench/apps/erpnext
sudo docker compose exec -T frappe readlink -f /workspace/bench/sites/assets/erpnext
sudo docker compose exec -T frappe ls -ld /workspace/bench/sites/assets/erpnext
sudo docker compose exec -T frappe ls -l /workspace/erpnext-source/erpnext/public/css/cephlon-raleway.css
sudo docker compose exec -T frappe ls -l /workspace/erpnext-source/erpnext/public/css/cephlon-erp-login.css
~~~

Expected targets:

- Bench app link: /workspace/erpnext-source
- Public asset link: /workspace/erpnext-source/erpnext/public
- Both source CSS files exist.

If the source files are missing, update the server Git checkout to the revision that contains the custom files before continuing:

~~~bash
git pull
~~~

## 2. Repair the generated public-assets link

The safe repair below creates the link if it is missing or corrects it if it is already a symlink. It stops if the destination exists as a real directory, so it will not replace generated files without inspection.

~~~bash
sudo docker compose exec -u root -T frappe bash -lc '
asset_link=/workspace/bench/sites/assets/erpnext
asset_target=/workspace/erpnext-source/erpnext/public

mkdir -p /workspace/bench/sites/assets
if [ -L "$asset_link" ]; then
  ln -sfn "$asset_target" "$asset_link"
elif [ ! -e "$asset_link" ]; then
  ln -s "$asset_target" "$asset_link"
else
  echo "Asset path exists as a real directory; inspect it before replacing it." >&2
  exit 1
fi

readlink -f "$asset_link"
test -f "$asset_link/css/cephlon-raleway.css"
test -f "$asset_link/css/cephlon-erp-login.css"
test -f "$asset_link/js/cephlon-erp-login.js"
test -f "$asset_link/js/cephlon-login.js"
test -f "$asset_link/css/cephlon-dashboard-panel.css"
test -f "$asset_link/css/cephlon-dashboard-home.css"
test -f "$asset_link/js/cephlon-dashboard-home.js"'
~~~

The command should print /workspace/erpnext-source/erpnext/public and exit successfully. If it says the path exists as a real directory, do not delete it blindly. Inspect its contents and permissions first.

If the guard reports that /workspace/bench/sites/assets/erpnext is a real directory, keep that directory. It may contain generated ERPNext bundles. Link only the Cephlon files into it so the existing bundle files remain in place:

~~~bash
sudo docker compose exec -u root -T frappe bash -lc '
source_dir=/workspace/erpnext-source/erpnext/public
asset_dir=/workspace/bench/sites/assets/erpnext
for file in \
  css/cephlon-raleway.css \
  css/cephlon-erp-login.css \
  css/cephlon-dashboard-panel.css \
  css/cephlon-dashboard-home.css \
  js/cephlon-erp-login.js \
  js/cephlon-login.js \
  js/cephlon-dashboard-home.js \
  images/cephlon-logo.png
do
  mkdir -p "$asset_dir/$(dirname "$file")"
  ln -sfn "$source_dir/$file" "$asset_dir/$file"
done
ls -l "$asset_dir/css/cephlon-raleway.css" "$asset_dir/js/cephlon-dashboard-home.js" "$asset_dir/images/cephlon-logo.png"'
~~~

This preserves other files in the real asset directory and makes the Cephlon files follow the checked-out source. Verify the paths, then continue with Step 3.

## 3. Clear cache and restart the web services

After the link and files are verified:

~~~bash
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost clear-cache
sudo docker compose restart frappe nginx
sudo docker compose ps
~~~

Wait until frappe and nginx are healthy.

## 4. Verify one asset, then all assets

Use the correct spelling and URL scheme. First test a single file from the server:

~~~bash
curl -i "http://127.0.0.1:3011/assets/erpnext/css/cephlon-raleway.css?v=2"
~~~

Expected result: HTTP 200. Do not use /assests/ or omit the // in http://.

Then check all current custom asset URLs:

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
  curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' "http://127.0.0.1:3011$path"
done
~~~

Every file should return HTTP 200. If one still returns 404, compare its URL filename with the source file under /workspace/erpnext-source/erpnext/public and with the reference in /workspace/bench/apps/erpnext/erpnext/hooks.py.

Check the login HTML references the Cephlon files:

~~~bash
curl -fsS http://127.0.0.1:3011/login | grep -E 'cephlon-erp-login|cephlon-login'
~~~

## 5. Reload in a browser

Open:

~~~text
http://YOUR_SERVER_IP:3011/login
~~~

After the server serves the current asset URLs, use Ctrl+F5 once to discard old browser-cached files. Sign in and check the Desk Home route at /desk/setup/home.

The curl checks run independently from your browser and do not alter its cookies or log it out. If you restarted Frappe during this repair, wait until the service is healthy and sign in again if needed.

## If the files still return 404

Check the Nginx and Frappe logs:

~~~bash
sudo docker compose logs --tail=100 nginx
sudo docker compose logs --tail=100 frappe
~~~

Confirm the port in the URL is the same as HTTP_PORT in .env. The current default is 3011. Confirm the app is installed and the source link is correct:

~~~bash
sudo docker compose exec -T -w /workspace/bench frappe bench --site development.localhost list-apps
sudo docker compose exec -T frappe readlink -f /workspace/bench/apps/erpnext
~~~

ERPNext should appear in list-apps, and the app link should resolve to /workspace/erpnext-source. If either check fails, follow the first-time setup in DEPLOY.md before retrying this guide.
