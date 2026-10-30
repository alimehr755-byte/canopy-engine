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
# Fully local data lives inside the project (.data) - survives temp cleanups.
$DATA = "$ROOT\.data"
$PG_DIR = "$DATA\pgsql"
$PG_DATA = "$DATA\postgres-data"
$PG_BIN = "$PG_DIR\bin"
$REDIS_DIR = "$DATA\redis"
$LOG_DIR = "$DATA\logs"

# Colors
function Write-Color { param($Color, $Msg) Write-Host $Msg -ForegroundColor $Color }

Write-Color Cyan "=== Veritas Engine Local Dev ==="
Write-Color Gray "Root: $ROOT"
Write-Color Gray "Data: $DATA"

# Cleanup function
function Cleanup {
    Write-Color Yellow "Shutting down..."
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -like "$DATA*" -or
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
        Write-Color Yellow "Cleaning local data directory..."
        Remove-Item -Recurse -Force "$DATA\postgres-data" -ErrorAction SilentlyContinue
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
    Write-Color Gray "Downloading embedded PostgreSQL 17 (small, once only ~25MB)..."
    New-Item -ItemType Directory -Force -Path $PG_DIR | Out-Null
    $jar = "$PG_DIR\pg.jar"
    $url = "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/17.4.0/embedded-postgres-binaries-windows-amd64-17.4.0.jar"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $jar -UseBasicParsing -TimeoutSec 600
    Write-Color Gray "Extracting (tar + lzma)..."
    tar -xf $jar -C $PG_DIR
    $txz = Get-ChildItem "$PG_DIR\*.txz" | Select-Object -First 1
    python -c "import lzma, shutil; shutil.copyfileobj(lzma.open(r'$($txz.FullName)'), open(r'$PG_DIR\pg.tar','wb'))"
    tar -xf "$PG_DIR\pg.tar" -C $PG_DIR
    Get-ChildItem "$PG_DIR\pg.jar", "$PG_DIR\pg.tar", "$PG_DIR\*.txz" -ErrorAction SilentlyContinue | Remove-Item -Force
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
if (-not (Test-Path "$REDIS_DIR\redis-server.exe")) {
    Write-Color Gray "Downloading Redis (one time only)..."
    $url = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
    $zip = "$DATA\redis.zip"
    New-Item -ItemType Directory -Force -Path $DATA | Out-Null
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
$webProc = Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList ".\node_modules\next\dist\bin\next","start","-p $Port" -WorkingDirectory $ROOT -RedirectStandardOutput $webLog -RedirectStandardError "$LOG_DIR\web.err.log" -PassThru -NoNewWindow
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
