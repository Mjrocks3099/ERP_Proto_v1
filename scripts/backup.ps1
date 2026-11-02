param(
    [string]$OutputDirectory = "./backups",
    [string]$Site = "development.localhost"
)

$ErrorActionPreference = "Stop"
$rootPassword = $env:MARIADB_ROOT_PASSWORD
if ([string]::IsNullOrWhiteSpace($rootPassword)) {
    throw "Set MARIADB_ROOT_PASSWORD in the environment before creating a backup."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$databaseFile = Join-Path $OutputDirectory "mariadb-$stamp.sql"

docker compose exec -T -e "MYSQL_PWD=$rootPassword" mariadb mariadb-dump --single-transaction --routines --events -uroot --all-databases | Set-Content -Path $databaseFile -Encoding utf8
docker compose exec -T -w /workspace/bench frappe bench --site $Site backup --with-files

Write-Output "Database backup written to $databaseFile"
Write-Output "Bench file backup completed for $Site"
