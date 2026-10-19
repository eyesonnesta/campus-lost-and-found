param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$tempRoot = (Resolve-Path -LiteralPath $env:TEMP).Path
$runRoot = Join-Path $tempRoot ('patatena-db-test-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $runRoot 'data'
$log = Join-Path $runRoot 'postgres.log'
$errorLog = Join-Path $runRoot 'postgres-error.log'
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
$started = $false

try {
  New-Item -ItemType Directory -Path $runRoot | Out-Null
  & (Join-Path $PgBin 'initdb.exe') -D $data -A trust -U postgres --no-instructions | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }

  $server = Start-Process -FilePath (Join-Path $PgBin 'postgres.exe') `
    -ArgumentList @('-D', $data, '-h', '127.0.0.1', '-p', "$port") `
    -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errorLog -PassThru
  $started = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    & (Join-Path $PgBin 'pg_isready.exe') -q -h 127.0.0.1 -p $port -U postgres -d postgres
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) {
    if (Test-Path -LiteralPath $errorLog) { Get-Content -LiteralPath $errorLog | Write-Output }
    throw 'PostgreSQL did not become ready'
  }

  $scripts = @(
    'supabase/tests/standalone_postgres_stub.sql',
    'supabase/migrations/20261015090000_reporting_foundation.sql',
    'supabase/migrations/20261019100000_text_reporting.sql',
    'supabase/migrations/20261019110000_item_image_storage.sql',
    'supabase/tests/reporting_foundation_smoke.sql',
    'supabase/tests/text_reporting_smoke.sql',
    'supabase/tests/item_image_storage_smoke.sql'
  )
  $psqlArgs = @('-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres')
  foreach ($script in $scripts) {
    $psqlArgs += @('-f', (Join-Path $repo $script))
  }
  & (Join-Path $PgBin 'psql.exe') @psqlArgs
  if ($LASTEXITCODE -ne 0) { throw 'SQL smoke test failed' }
} finally {
  if ($started -and -not $server.HasExited) {
    & (Join-Path $PgBin 'pg_ctl.exe') -D $data -m immediate -W stop | Out-Null
    if (-not $server.WaitForExit(10000)) {
      throw "Disposable PostgreSQL server did not stop; test data retained at $runRoot"
    }
  }
  $resolvedRoot = (Resolve-Path -LiteralPath $runRoot -ErrorAction SilentlyContinue).Path
  if ($resolvedRoot -and $resolvedRoot.StartsWith($tempRoot + [IO.Path]::DirectorySeparatorChar,
      [StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path -Leaf $resolvedRoot) -match '^patatena-db-test-[0-9a-f]{32}$') {
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
  }
}
