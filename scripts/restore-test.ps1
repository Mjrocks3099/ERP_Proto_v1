param(
    [Parameter(Mandatory = $true)][string]$DumpFile,
    [string]$RestoreProject = "cephlon-restore"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $DumpFile -PathType Leaf)) {
    throw "Backup file not found: $DumpFile"
}
if ($RestoreProject -in @("cephlon-erp", "erpnext")) {
    throw "Refusing to use the production/default project name: $RestoreProject"
}
$rootPassword = $env:MARIADB_ROOT_PASSWORD
if ([string]::IsNullOrWhiteSpace($rootPassword)) {
    throw "Set MARIADB_ROOT_PASSWORD for the isolated restore database."
}

$composeArgs = @("compose", "-p", $RestoreProject, "-f", "docker-compose.yml", "-f", "docker-compose.production.yml")
try {
    docker @composeArgs up -d mariadb
    do {
        Start-Sleep -Seconds 3
        docker @composeArgs exec -T mariadb healthcheck.sh --connect --innodb_initialized *> $null
    } while ($LASTEXITCODE -ne 0)

    Get-Content -LiteralPath $DumpFile -Raw | docker @composeArgs exec -T -e "MYSQL_PWD=$rootPassword" mariadb mariadb -uroot
    docker @composeArgs exec -T -e "MYSQL_PWD=$rootPassword" mariadb mariadb -uroot -e "SHOW DATABASES;"
    Write-Output "Isolated database restore completed successfully for project $RestoreProject."
}
finally {
    docker @composeArgs down -v --remove-orphans *> $null
}
