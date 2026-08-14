param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,
  [string]$User = "root",
  [string]$RemoteDir = "/opt/testhistory",
  [string]$ApiPort = "18080",
  [string]$WebPort = "5173"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$archive = Join-Path ([System.IO.Path]::GetTempPath()) ("testhistory-deploy-{0}.tar.gz" -f ([guid]::NewGuid()))
$remoteArchive = "/tmp/testhistory-deploy.tar.gz"
$target = "$User@$HostName"

Push-Location $root
try {
  tar `
    --exclude=.git `
    --exclude=node_modules `
    --exclude=.tmp `
    --exclude=.codex-local `
    --exclude=**/build `
    --exclude=**/.gradle `
    -czf $archive .

  scp $archive "${target}:${remoteArchive}"

  $remoteScript = @"
set -eu
mkdir -p '$RemoteDir'
tar -xzf '$remoteArchive' -C '$RemoteDir'
cd '$RemoteDir'
cat > .env <<'EOF'
TESTHISTORY_HOST_BIND=0.0.0.0
API_PORT=$ApiPort
WEB_PORT=$WebPort
DATABASE_URL=postgres://testhistory:testhistory@postgres:5432/testhistory
REDIS_URL=redis://redis:6379
RABBITMQ_URL=amqp://testhistory:testhistory@rabbitmq:5672/testhistory
S3_ENDPOINT=http://minio:9000
S3_BUCKET=testhistory-artifacts
CLICKHOUSE_URL=http://clickhouse:8123
OPENSEARCH_URL=http://opensearch:9200
TESTHISTORY_API_URL=http://api:8080
EOF
docker compose --env-file .env up -d --build postgres redis rabbitmq minio minio-init clickhouse opensearch api worker web
docker compose --env-file .env ps
for i in `$(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$ApiPort/health" >/dev/null; then
    echo "TestHistory API is healthy at http://${HostName}:$ApiPort"
    echo "TestHistory Web is available at http://${HostName}:$WebPort"
    exit 0
  fi
  sleep 3
done
echo "TestHistory API did not become healthy in time" >&2
docker compose --env-file .env logs --tail=160 api worker web
exit 1
"@

  $remoteScript | ssh $target "sh -s"
}
finally {
  Pop-Location
  Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
}
