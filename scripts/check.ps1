param(
  [switch]$Infra
)

$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE."
  }
}

Invoke-CheckedCommand npm.cmd run check

if ($Infra) {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    Invoke-CheckedCommand docker compose -f docker-compose.yml config --quiet
  } else {
    Write-Warning "docker not found; skipping docker compose config validation."
  }

  if (Get-Command kubectl -ErrorAction SilentlyContinue) {
    Invoke-CheckedCommand kubectl kustomize infra/k8s
  } else {
    Write-Warning "kubectl not found; skipping Kubernetes manifest render validation."
  }
}
