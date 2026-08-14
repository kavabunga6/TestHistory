param(
  [ValidateSet("help", "validate", "validate-all", "deploy", "undeploy", "status", "logs", "migrate", "smoke")]
  [string]$Command = "validate",
  [string]$KustomizePath = "infra/k8s",
  [string]$Namespace = "testhistory",
  [string]$SmokeUrl = $env:TESTHISTORY_K8S_SMOKE_URL,
  [string]$WebUrl = $env:TESTHISTORY_K8S_WEB_URL,
  [switch]$RequireKubectl,
  [switch]$AllowPlaceholders
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
TestHistory Kubernetes wrapper

Usage:
  .\scripts\k8s.ps1 <command> [-KustomizePath infra/k8s/overlays/prod] [-Namespace testhistory] [-SmokeUrl https://api-host] [-WebUrl https://web-host] [-RequireKubectl] [-AllowPlaceholders]

Commands:
  validate  Run manifest/readiness smoke and offline kubectl kustomize render when kubectl is installed
  validate-all  Validate base, local overlay, and prod overlay paths
  deploy    Validate, kubectl apply, wait migration and rollouts, then optional API/docs/web smoke
  undeploy  kubectl delete selected kustomize path with --ignore-not-found
  status    Show workload, ingress, PVC, ConfigMap, and Secret status
  logs      Tail API worker web logs
  migrate   Recreate and wait the migration job
  smoke     Run Kubernetes readiness smoke and optional live HTTP smoke
  help      Print this help

Options:
  -KustomizePath   Kustomize path, default infra/k8s
  -Namespace       Kubernetes namespace, default testhistory
  -SmokeUrl        Public API/docs base URL for live /health and /docs smoke
  -WebUrl          Public web base URL for live UI smoke
  -RequireKubectl  Fail validation when kubectl cannot render manifests; CI sets TESTHISTORY_K8S_REQUIRE_KUBECTL=1
  -AllowPlaceholders  Permit replace-with-* and replace-prod-* values for isolated non-production labs
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
    throw "Missing required command(s): $($missing -join ', '). Install prerequisites or run .\scripts\k8s.ps1 help."
  }
}

function Validate-Manifests {
  Assert-Command @("npm")
  Invoke-Step @("npm", "run", "smoke:k8s")
  Test-KustomizePath $KustomizePath
}

function Validate-AllManifests {
  Assert-Command @("npm")
  Invoke-Step @("npm", "run", "smoke:k8s")
  foreach ($path in @("infra/k8s", "infra/k8s/overlays/local", "infra/k8s/overlays/prod")) {
    Test-KustomizePath $path
  }
}

function Test-KustomizePath {
  param([string]$Path)
  if (Test-Command "kubectl") {
    Invoke-Step @("kubectl", "kustomize", $Path)
  } elseif ($RequireKubectl -or $env:TESTHISTORY_K8S_REQUIRE_KUBECTL -in @("1", "true")) {
    throw "kubectl not found; required Kubernetes manifest render for $Path"
  } else {
    Write-Warning "kubectl not found; skipped Kubernetes manifest render for $Path"
  }
}

function Assert-NoDeploymentPlaceholders {
  if ($AllowPlaceholders) {
    Write-Warning "Allowed placeholder values for this Kubernetes action by explicit flag."
    return
  }

  $root = Resolve-Path -LiteralPath $KustomizePath -ErrorAction Stop
  $files = @()
  $item = Get-Item -LiteralPath $root -ErrorAction Stop
  if ($item.PSIsContainer) {
    $files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Include *.yaml, *.yml, *.json)
  } elseif ($item.Extension -match "^\.(ya?ml|json)$") {
    $files = @($item)
  }

  $findings = @()
  foreach ($file in $files) {
    $matches = Select-String -LiteralPath $file.FullName -Pattern "\b(replace-with-[\w-]+|replace-prod-[\w-]+)\b" -AllMatches
    foreach ($match in $matches) {
      $values = @($match.Matches | ForEach-Object { $_.Value } | Select-Object -Unique)
      $relative = Resolve-RelativePath $file.FullName
      $findings += "$relative`:$($match.LineNumber) $($values -join ', ')"
    }
  }

  if ($findings.Count -gt 0) {
    $preview = @($findings | Select-Object -First 20) -join "`n- "
    throw "Kubernetes $Command refused placeholder values in $KustomizePath.`nReplace these values in an overlay or pass -AllowPlaceholders only for non-production dry labs:`n- $preview"
  }
}

function Resolve-RelativePath {
  param([string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $rootPath = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd("\", "/")
  if ($fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $fullPath.Substring($rootPath.Length).TrimStart("\", "/")
  }
  return $fullPath
}

function Recreate-MigrationJob {
  Invoke-Step @("kubectl", "delete", "job/testhistory-db-migrate", "-n", $Namespace, "--ignore-not-found")
  Invoke-Step @("kubectl", "apply", "-k", $KustomizePath)
}

function Wait-MigrationJob {
  Invoke-Step @("kubectl", "wait", "--for=condition=complete", "job/testhistory-db-migrate", "-n", $Namespace, "--timeout=180s")
}

function Wait-Rollout {
  Wait-MigrationJob
  Invoke-Step @("kubectl", "rollout", "status", "deploy/testhistory-api", "-n", $Namespace, "--timeout=180s")
  Invoke-Step @("kubectl", "rollout", "status", "deploy/testhistory-worker", "-n", $Namespace, "--timeout=180s")
  Invoke-Step @("kubectl", "rollout", "status", "deploy/testhistory-web", "-n", $Namespace, "--timeout=180s")
}

function Invoke-LiveSmoke {
  if ([string]::IsNullOrWhiteSpace($SmokeUrl)) {
    Write-Warning "TESTHISTORY_K8S_SMOKE_URL not set; skipped live Kubernetes HTTP smoke"
  } else {
    $baseUrl = $SmokeUrl.TrimEnd("/")
    foreach ($path in @("/health", "/docs")) {
      $url = "$baseUrl$path"
      $response = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 10
      if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
        throw "Kubernetes live smoke returned HTTP $($response.StatusCode) for $url"
      }
    }
  }

  if ([string]::IsNullOrWhiteSpace($WebUrl)) {
    Write-Warning "TESTHISTORY_K8S_WEB_URL not set; skipped live Kubernetes web smoke"
    return
  }

  $webBaseUrl = $WebUrl.TrimEnd("/")
  $response = Invoke-WebRequest -UseBasicParsing $webBaseUrl -TimeoutSec 10
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
    throw "Kubernetes web smoke returned HTTP $($response.StatusCode) for $webBaseUrl"
  }
}

try {
  switch ($Command) {
    "help" {
      Show-Help
    }
    "validate" {
      Validate-Manifests
    }
    "validate-all" {
      Validate-AllManifests
    }
    "deploy" {
      Assert-NoDeploymentPlaceholders
      Assert-Command @("kubectl")
      Validate-Manifests
      Recreate-MigrationJob
      Wait-Rollout
      Invoke-LiveSmoke
    }
    "undeploy" {
      Assert-Command @("kubectl")
      Invoke-Step @("kubectl", "delete", "-k", $KustomizePath, "--ignore-not-found")
    }
    "status" {
      Assert-Command @("kubectl")
      Invoke-Step @("kubectl", "get", "all,ingress,pvc,configmap,secret", "-n", $Namespace)
    }
    "logs" {
      Assert-Command @("kubectl")
      Invoke-Step @("kubectl", "logs", "-n", $Namespace, "deploy/testhistory-api", "--tail=120")
      Invoke-Step @("kubectl", "logs", "-n", $Namespace, "deploy/testhistory-worker", "--tail=120")
      Invoke-Step @("kubectl", "logs", "-n", $Namespace, "deploy/testhistory-web", "--tail=120")
    }
    "migrate" {
      Assert-NoDeploymentPlaceholders
      Assert-Command @("kubectl")
      Recreate-MigrationJob
      Wait-MigrationJob
    }
    "smoke" {
      Assert-Command @("npm")
      Invoke-Step @("npm", "run", "smoke:k8s")
      Invoke-LiveSmoke
    }
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
