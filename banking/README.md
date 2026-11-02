# ERPNext Banking App

This repository contains ERPNext and a custom Banking single-page app (SPA), plus a Docker Compose setup for local development. The SPA is built with React, TypeScript, Vite, Tailwind CSS, and Frappe UI components. It is served by the Frappe site at `/banking` and uses Frappe APIs for banking data and operations.

## Project structure

- `banking/src/App.tsx` — React app providers, authentication redirect, and page routes.
- `banking/src/pages/` — page-level views, including bank reconciliation and statement import.
- `banking/src/components/features/BankReconciliation/` — bank picker, matching, transactions, statements, balances, and reconciliation workflows.
- `banking/src/components/features/BankStatementImporter/` — CSV/PDF statement import and preview flows.
- `banking/src/components/ui/` — reusable UI components.
- `banking/src/hooks/`, `banking/src/lib/`, `banking/src/types/` — shared hooks, Frappe helpers, and TypeScript models.
- `banking/vite.config.ts` — Vite development server and production asset output configuration.
- `erpnext/` — ERPNext Frappe app code; `erpnext/www/banking.py` provides the SPA web entry/context.
- `docker-compose.yml` — local MariaDB, Redis, Frappe bench, and Nginx services.
- `docker-setup.ps1` — Windows local development bootstrap for the Compose stack and development site.
- `nginx/default.conf` — local Nginx reverse proxy to the Frappe web process.

## How the app works

In development, Vite serves the React app and proxies API calls to the Frappe site (see `banking/proxyOptions.ts`). Frappe provides the session, boot data, API methods, and database records. In production, Vite writes compiled assets to `erpnext/public/banking`; the build also copies the generated HTML entry into `erpnext/www/banking.html`. Frappe serves that entry at `/banking`, with assets loaded from `/assets/erpnext/banking/`.

The dashboard route is the bank reconciliation workspace. It loads the user's bank accounts, selects the default (or first available) account, and displays reconciliation tabs and balance information. Statement import is available at `/banking/statement-importer`.

## Local development with Docker (Windows)

Requirements: Docker Desktop with Compose v2 and PowerShell. From the repository root (`C:\erpnext`), run:

```powershell
.\docker-setup.ps1
```

The script starts MariaDB, Redis, the Frappe bench container, and Nginx; initializes a bench if needed; links this checkout as the ERPNext app; creates `development.localhost`; installs ERPNext; and starts Bench. Open `http://development.localhost:8080`. The script currently prints the development login `Administrator` / `admin`; these are local development credentials only.

To stop the containers:

```powershell
docker compose down
```

To stop containers and delete the local database/bench volumes (this deletes local development data):

```powershell
docker compose down --volumes
```

## Build the Banking frontend after changes

Install the frontend dependencies once, then from `banking/` build the assets:

```powershell
cd banking
yarn install
yarn build
```

The build output goes to `erpnext/public/banking/`, and the HTML entry is copied to `erpnext/www/banking.html`. Those generated paths are ignored by Git, so run the build again after pulling or checking out a clean tree before expecting the bundled app to be present.

For active frontend development, with the local Frappe site running:

```powershell
cd banking
yarn dev
```

Vite listens on port `8080` by default; adjust the local port or Compose port mapping if both services need that port at once. Run `yarn lint` from `banking/` to check frontend lint rules.

## Deploying to a server

The checked-in Compose stack is for local development, not production: it uses a bench development container, a `sleep infinity` command, host-published services, and development credentials. Do not expose this configuration directly to the internet. For a real server, use the official [Frappe Docker production deployment documentation](https://github.com/frappe/frappe_docker/tree/main/docs) and its production Compose configuration. Configure a domain, HTTPS, secrets, persistent database/site storage, backups, and a supported image/build pipeline there.

A typical release flow for this repository is:

1. Commit and push the ERPNext/Banking changes to the branch or tag used by the server.
2. Build the Banking frontend (`cd banking; yarn install; yarn build`) as part of the release/build process so the compiled files are included in the ERPNext image or deployment artifact.
3. Build and publish a Frappe/ERPNext image that includes this repository revision and the generated Banking assets, following the official Frappe Docker custom image workflow. The local `frappe/bench:latest` service is not that production image.
4. On the server, update the configured image tag and deploy using the production Compose workflow; run the site's required Bench migrations/build steps as documented for that deployment, then verify `/banking` and the ERPNext site.
5. Keep the previous known-good image tag available for rollback and back up the site/database before upgrades.

The exact server commands depend on the production Compose files, site configuration, registry, and domain used by your deployment. Those are not specified in this repository, so this guide does not invent server credentials or claim the local `docker-setup.ps1` is a production installer.

## Rebuilding local Docker images

The local `docker-compose.yml` uses published base images and does not define a custom ERPNext `Dockerfile`; editing application code is picked up through the mounted source and the Banking asset build. To recreate the local containers after changing Compose configuration, run:

```powershell
docker compose up -d --force-recreate
```

For a production image, follow the Frappe Docker custom image workflow and tag the image with the source revision. Do not use `docker compose down --volumes` on a server as a routine rebuild step because it deletes persistent data.