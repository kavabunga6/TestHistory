param(
  [ValidateSet("help", "doctor", "up", "down", "restart", "status", "logs", "smoke", "reset", "migrate")]
  [string]$Command = "up",
  [switch]$Mcp,
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

function Invoke-Step {
  param([string[]]$CommandArgs)
  Write-Host "> $($CommandArgs -join ' ')" -ForegroundColor Cyan
  & $CommandArgs[0] @($CommandArgs | Select-Object -Skip 1)
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $($CommandArgs -join ' ')"
  }
}

function Show-Help {
  Write-Host @"
TestHistory local stack

Usage:
  .\scripts\local-stack.ps1 <command> [-Mcp] [-NoBuild]

Commands:
  doctor    Check Docker/npm prerequisites and Compose config without starting containers
  up        Validate Compose, build/start API worker web, run migrations, then smoke API/web/docs
  down      Stop the stack and remove orphan containers
  restart   Restart API worker web and run smoke checks
  status    Show Docker Compose service status
  logs      Tail API worker web logs
  smoke     Run API, web, and Swagger smoke checks against the local stack
  migrate   Run the migration job through the operations profile
  reset     Stop the stack and remove volumes
  help      Print this help

Options:
  -Mcp      Include the MCP service/profile where supported
  -NoBuild  Start existing images without rebuilding

Local endpoints after up:
  Web:     http://127.0.0.1:5173
  API:     http://127.0.0.1:18080
  Swagger: http://127.0.0.1:18080/docs
  OpenAPI: http://127.0.0.1:18080/docs/json
  Web docs proxy: http://127.0.0.1:5173/docs

Set TESTHISTORY_HOST_BIND=0.0.0.0 in .env when GitLab runner must reach the API through the host IP.
"@
}

function Test-Command {
  param([string]$Name)
  $resolved = Get-Command $Name -ErrorAction SilentlyContinue
  return $null -ne $resolved
}

function Assert-Command {
  param([string[]]$Names)
  $missing = @($Names | Where-Object { -not (Test-Command $_) })
  if ($missing.Count -gt 0) {
    throw "Missing required command(s): $($missing -join ', '). Install prerequisites or run .\scripts\local-stack.ps1 help."
  }
}

function ComposeArgs {
  param([string[]]$Tail)
  $args = @("docker", "compose")
  if ($Mcp) {
    $args += @("--profile", "mcp")
  }
  return $args + $Tail
}

function Run-Smoke {
  $previous = $env:SMOKE_API_BASE_URL
  try {
    $env:SMOKE_API_BASE_URL = "http://127.0.0.1:18080"
    Invoke-Step @("npm", "run", "smoke:api")
    $web = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5173/" -TimeoutSec 10
    if ($web.StatusCode -lt 200 -or $web.StatusCode -ge 400) {
      throw "Web smoke returned HTTP $($web.StatusCode)"
    }
    $docs = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:18080/docs" -TimeoutSec 10
    if ($docs.StatusCode -lt 200 -or $docs.StatusCode -ge 400) {
      throw "Swagger smoke returned HTTP $($docs.StatusCode)"
    }
    $webDocs = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5173/docs" -TimeoutSec 10
    if ($webDocs.StatusCode -lt 200 -or $webDocs.StatusCode -ge 400) {
      throw "Web Swagger proxy smoke returned HTTP $($webDocs.StatusCode)"
    }
    $webOpenApi = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5173/docs/json" -TimeoutSec 10
    if ($webOpenApi.StatusCode -lt 200 -or $webOpenApi.StatusCode -ge 400) {
      throw "Web OpenAPI proxy smoke returned HTTP $($webOpenApi.StatusCode)"
    }
  } finally {
    if ($null -eq $previous) {
      Remove-Item Env:SMOKE_API_BASE_URL -ErrorAction SilentlyContinue
    } else {
      $env:SMOKE_API_BASE_URL = $previous
    }
  }
}

function Show-Endpoints {
  Write-Host @"
Local endpoints:
  Web:     http://127.0.0.1:5173
  API:     http://127.0.0.1:18080
  Swagger: http://127.0.0.1:18080/docs
  OpenAPI: http://127.0.0.1:18080/docs/json
  Web docs proxy: http://127.0.0.1:5173/docs

Runner access:
  Set TESTHISTORY_HOST_BIND=0.0.0.0 in .env and use http://<host-ip>:18080 as TESTHISTORY_BASE_URL.
"@
}

switch ($Command) {
  "help" {
    Show-Help
  }
  "doctor" {
    Assert-Command @("docker", "npm")
    Invoke-Step (ComposeArgs @("config", "--quiet"))
    Show-Endpoints
  }
  "up" {
    Assert-Command @("docker", "npm")
    Invoke-Step (ComposeArgs @("config", "--quiet"))
    $upArgs = @("up")
    if (-not $NoBuild) {
      $upArgs += "--build"
    }
    $upArgs += @("--wait", "api", "worker", "web")
    if ($Mcp) {
      $upArgs += "mcp"
    }
    Invoke-Step (ComposeArgs $upArgs)
    Invoke-Step (ComposeArgs @("--profile", "operations", "run", "--rm", "api-migrate"))
    Run-Smoke
    Show-Endpoints
  }
  "down" {
    Assert-Command @("docker")
    Invoke-Step (ComposeArgs @("down", "--remove-orphans"))
  }
  "restart" {
    Assert-Command @("docker", "npm")
    Invoke-Step (ComposeArgs @("restart", "api", "worker", "web"))
    Run-Smoke
  }
  "status" {
    Assert-Command @("docker")
    Invoke-Step (ComposeArgs @("ps"))
  }
  "logs" {
    Assert-Command @("docker")
    Invoke-Step (ComposeArgs @("logs", "--tail", "120", "api", "worker", "web"))
  }
  "smoke" {
    Assert-Command @("npm")
    Run-Smoke
  }
  "reset" {
    Assert-Command @("docker")
    Invoke-Step (ComposeArgs @("down", "--volumes", "--remove-orphans"))
  }
  "migrate" {
    Assert-Command @("docker")
    Invoke-Step (ComposeArgs @("--profile", "operations", "run", "--rm", "api-migrate"))
  }
}
