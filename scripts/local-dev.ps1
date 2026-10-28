<#
.SYNOPSIS
    Start Veritas Engine locally with all services (Postgres, Redis, Python engine, Next.js, Worker)
.DESCRIPTION
    Downloads/starts embedded PostgreSQL and Redis binaries, initializes database,
    starts Python FastAPI engine, Next.js web server, and BullMQ worker.
    No Docker, no external services required.
#>

param(
    [switch]$Clean,
    [switch]$SkipSeed,
    [switch]$Detach,
    [string]$Port = "3100",
    [string]$PythonPort = "8000"
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Definition | Split-Path -Parent
$TEMP = "$env:TEMP\veritas-local"
$PG_DIR = "$TEMP\pgsql"
$PG_DATA = "$PG_DIR\data"
$PG_BIN = "$PG_DIR\bin"

# Colors
function Write-Color { param($Color, $Msg) Write-Host $Msg -ForegroundColor $Color }

# Reuse existing opencode temp Postgres binaries if available (always use a fresh data dir)
$EXISTING_PG = "C:\Users\MUHAMM~1\AppData\Local\Temp\opencode\pgsql"
$PG_DATA = "$TEMP\pgsql-data"
if (Test-Path "$EXISTING_PG\pgsql\bin\postgres.exe") {
    $PG_BIN = "$EXISTING_PG\pgsql\bin"
    Write-Color Green "Reusing existing PostgreSQL binaries from opencode temp"
}
elseif (Test-Path "$EXISTING_PG\bin\postgres.exe") {
    $PG_BIN = "$EXISTING_PG\bin"
    Write-Color Green "Reusing existing PostgreSQL from opencode temp"
}
$REDIS_DIR = "$TEMP\redis"
$LOG_DIR = "$TEMP\logs"

Write-Color Cyan "=== Veritas Engine Local Dev ==="
Write-Color Gray "Root: $ROOT"
Write-Color Gray "Temp: $TEMP"

# Cleanup function
function Cleanup {
    Write-Color Yellow "Shutting down..."
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -like "$TEMP*" -or
        $_.CommandLine -like "*next*start*" -or
        $_.CommandLine -like "*tsx*worker*" -or
        $_.CommandLine -like "*uvicorn*"
    } | Stop-Process -Force -ErrorAction SilentlyContinue

    # Kill by port
    @($Port, $PythonPort, "55432", "6379") | ForEach-Object {
        $listen = netstat -ano | Select-String ":$_ " | Select-String "LISTENING"
        if ($listen) {
            $procId = ($listen[0] -split '\s+')[-1]
            if ($procId) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
        }
    }

    if ($Clean) {
        Write-Color Yellow "Cleaning temp directory..."
        Remove-Item -Recurse -Force $TEMP -ErrorAction SilentlyContinue
    }
}

# Trap exit
$global:cleanupDone = $false
if (-not $Detach) {
    Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { if (-not $global:cleanupDone) { Cleanup } } | Out-Null
}

# Step 1: PostgreSQL
Write-Color Cyan "`n[1/6] PostgreSQL"
if (-not (Test-Path "$PG_BIN\postgres.exe")) {
    Write-Color Gray "Downloading PostgreSQL 16 (compact)..."
    # Use smaller BigSQL distribution (~120MB vs 338MB)
    $url = "https://www.bigsql.org/uploads/3/8/0/2/3802057/pg16.4-windows-x64.zip"
    $zip = "$TEMP\pgsql.zip"
    New-Item -ItemType Directory -Force -Path $TEMP | Out-Null
    try {
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 600
    } catch {
        Write-Color Yellow "BigSQL failed, trying EDB..."
        $url = "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip"
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 600
    }
    Write-Color Gray "Extracting..."
    Expand-Archive -Path $zip -DestinationPath $PG_DIR -Force
    Remove-Item $zip
}
else { Write-Color Green "PostgreSQL already present" }

if (-not (Test-Path "$PG_DATA\PG_VERSION") -or $Clean) {
    Write-Color Gray "Initializing database cluster..."
    Remove-Item -Recurse -Force $PG_DATA -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $PG_DATA | Out-Null
    & "$PG_BIN\initdb.exe" -D $PG_DATA -A trust -U postgres | Out-Null
    Write-Color Green "Database initialized"
}
else { Write-Color Green "Database cluster exists" }

Write-Color Gray "Starting PostgreSQL on port 55432..."
$pgLog = "$LOG_DIR\postgres.log"
New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null
if (Test-NetConnection 127.0.0.1 -Port 55432 -InformationLevel Quiet) {
    Write-Color Green "PostgreSQL already running on 55432 (reusing)"
}
else {
    Remove-Item "$PG_DATA\postmaster.pid" -Force -ErrorAction SilentlyContinue
    $pgProc = Start-Process -FilePath "$PG_BIN\pg_ctl.exe" -ArgumentList "-D `"$PG_DATA`" -o `"`-p 55432 -c listen_addresses=127.0.0.1`" -l `"$pgLog`" start" -PassThru -NoNewWindow
    Write-Color Green "PostgreSQL started (PID: $($pgProc.Id))"
}

# Wait for PG
Write-Color Gray "Waiting for PostgreSQL..."
for ($i=0; $i -lt 30; $i++) {
    if (Test-NetConnection 127.0.0.1 -Port 55432 -InformationLevel Quiet) { break }
    Start-Sleep 1
}
Write-Color Green "PostgreSQL ready"

# Step 2: Redis
Write-Color Cyan "`n[2/6] Redis"
$EXISTING_REDIS = "C:\Users\MUHAMM~1\AppData\Local\Temp\opencode\redis"
if (Test-Path "$EXISTING_REDIS\redis-server.exe") {
    $REDIS_DIR = $EXISTING_REDIS
    Write-Color Green "Reusing existing Redis from opencode temp"
}
elseif (-not (Test-Path "$REDIS_DIR\redis-server.exe")) {
    Write-Color Gray "Downloading Redis..."
    $url = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
    $zip = "$TEMP\redis.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $REDIS_DIR -Force
    Remove-Item $zip
}
else { Write-Color Green "Redis already present" }

Write-Color Gray "Starting Redis on port 6379..."
$redisLog = "$LOG_DIR\redis.log"
if (Test-NetConnection 127.0.0.1 -Port 6379 -InformationLevel Quiet) {
    Write-Color Green "Redis already running on 6379 (reusing)"
}
else {
    $redisProc = Start-Process -FilePath "$REDIS_DIR\redis-server.exe" -ArgumentList "--port 6379 --bind 127.0.0.1 --logfile `"$redisLog`" --dir `"$REDIS_DIR`"" -PassThru -NoNewWindow
    Write-Color Green "Redis started (PID: $($redisProc.Id))"
}
Start-Sleep 2

# Step 3: Database setup
Write-Color Cyan "`n[3/6] Database Setup"
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:55432/veritas?schema=public"
cd $ROOT

Write-Color Gray "Running Prisma db push..."
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
cmd /c "npx prisma db push --skip-generate 2>&1"
$ErrorActionPreference = $prevEAP

if (-not $SkipSeed) {
    Write-Color Gray "Seeding database..."
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    cmd /c "npx tsx prisma/seed.ts 2>&1"
    $ErrorActionPreference = $prevEAP
}

# Step 4: Python AI Engine (optional - falls back to heuristic if unavailable)
Write-Color Cyan "`n[4/6] Python AI Engine"
$pyLog = "$LOG_DIR\python-engine.log"
$pyErrLog = "$LOG_DIR\python-engine.err.log"
$pythonReady = $false

if (Test-NetConnection 127.0.0.1 -Port $PythonPort -InformationLevel Quiet) {
    Write-Color Green "Python engine already running on $PythonPort (reusing)"
    $pythonReady = $true
}
else {
    $uvicornCheck = & python -m uvicorn --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        $pyProc = Start-Process -FilePath "python" -ArgumentList "-m uvicorn main:app --host 127.0.0.1 --port $PythonPort" -WorkingDirectory "$ROOT\python-engine" -RedirectStandardOutput $pyLog -RedirectStandardError $pyErrLog -PassThru -NoNewWindow
        Write-Color Green "Python engine started (PID: $($pyProc.Id)) on port $PythonPort"
        for ($i=0; $i -lt 30; $i++) {
            try { $r = Invoke-RestMethod "http://127.0.0.1:$PythonPort/health" -TimeoutSec 2; if ($r.status -eq "ok") { $pythonReady = $true; break } } catch {}
            Start-Sleep 1
        }
    }
    else {
        Write-Color Yellow "Python deps not installed - skipping engine (AI detection uses built-in heuristic fallback)"
        Write-Color Gray "To enable later: pip install -r python-engine\requirements.txt"
    }
}

if ($pythonReady) {
    $env:AI_ENGINE_URL = "http://127.0.0.1:$PythonPort"
    Write-Color Green "Python engine ready"
}
else {
    $env:AI_ENGINE_URL = ""
    Write-Color Yellow "AI engine offline - using heuristic fallback"
}

# Step 5: Next.js Web
Write-Color Cyan "`n[5/6] Next.js Web Server"
$env:PORT = $Port
$env:ANALYSIS_MODE = "queue"
$env:REDIS_URL = "redis://127.0.0.1:6379"
$env:SEMANTIC_SIMILARITY_THRESHOLD = "0.6"
$webLog = "$LOG_DIR\web.log"
$webProc = Start-Process -FilePath "npx.cmd" -ArgumentList "next start -p $Port" -WorkingDirectory $ROOT -RedirectStandardOutput $webLog -RedirectStandardError "$LOG_DIR\web.err.log" -PassThru -NoNewWindow
Write-Color Green "Next.js started (PID: $($webProc.Id)) on port $Port"

# Wait for web
Write-Color Gray "Waiting for web server..."
for ($i=0; $i -lt 60; $i++) {
    try { $r = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2; if ($r.database) { break } } catch {}
    Start-Sleep 1
}
Write-Color Green "Web server ready"

# Step 6: Worker
Write-Color Cyan "`n[6/6] BullMQ Worker"
$workerLog = "$LOG_DIR\worker.log"
$workerProc = Start-Process -FilePath "npx.cmd" -ArgumentList "tsx src/worker.ts" -WorkingDirectory $ROOT -RedirectStandardOutput $workerLog -RedirectStandardError "$LOG_DIR\worker.err.log" -PassThru -NoNewWindow
Write-Color Green "Worker started (PID: $($workerProc.Id))"

# Summary
Write-Color Cyan "`n=== All Services Running ==="
Write-Color Gray "Web:          http://127.0.0.1:$Port"
Write-Color Gray "Health:       http://127.0.0.1:$Port/api/health"
Write-Color Gray "Python Engine: http://127.0.0.1:$PythonPort/health"
Write-Color Gray "PostgreSQL:   127.0.0.1:55432 (user: postgres, db: veritas)"
Write-Color Gray "Redis:        127.0.0.1:6379"
Write-Color Gray "`nLogs:         $LOG_DIR"

if ($Detach) {
    Write-Color Green "`nDetached mode - services keep running in the background."
    Write-Color Gray "Stop them later with: scripts\local-dev.ps1 -Clean  (or kill ports 3100/8000/55432/6379)"
    exit 0
}

Write-Color Yellow "Press Ctrl+C to stop all services"

# Keep running
try {
    while ($true) { Start-Sleep 10 }
}
finally {
    $global:cleanupDone = $true
    Cleanup
}
