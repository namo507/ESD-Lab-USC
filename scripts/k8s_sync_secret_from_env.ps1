$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
  throw 'kubectl is required to apply Kubernetes Secrets.'
}

$envPath = Join-Path $repoRoot '.env'
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) {
      return
    }
    $pair = $line -split '=', 2
    if ($pair.Count -ne 2) {
      return
    }
    $name = $pair[0].Trim()
    $value = $pair[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

$namespace = if ($env:K8S_HELM_NAMESPACE) { $env:K8S_HELM_NAMESPACE } else { 'esd-lab' }
$secretName = if ($env:K8S_SECRET_NAME) { $env:K8S_SECRET_NAME } else { 'esd-lab-dashboard-secrets' }

$participantIdSalt = if ($env:PARTICIPANT_ID_SALT) { $env:PARTICIPANT_ID_SALT } else { $env:NANO_ID_SALT }
$assistantApiKey = if ($env:DASHBOARD_ASSISTANT_API_KEY) {
  $env:DASHBOARD_ASSISTANT_API_KEY
} elseif ($env:DASHBOARD_ASSISTANT_FALLBACK_API_KEY) {
  $env:DASHBOARD_ASSISTANT_FALLBACK_API_KEY
} else {
  $env:OPENAI_API_KEY
}
$geminiApiKey = if ($env:DASHBOARD_ASSISTANT_GEMINI_API_KEY) { $env:DASHBOARD_ASSISTANT_GEMINI_API_KEY } else { $env:GEMINI_API_KEY }

kubectl get namespace $namespace *> $null
if ($LASTEXITCODE -ne 0) {
  kubectl create namespace $namespace *> $null
}

kubectl -n $namespace create secret generic $secretName `
  --from-literal=redcapApiUrl="$($env:REDCAP_API_URL)" `
  --from-literal=redcapApiToken="$($env:REDCAP_API_TOKEN)" `
  --from-literal=participantIdSalt="$participantIdSalt" `
  --from-literal=dashboardOperatorToken="$($env:DASHBOARD_OPERATOR_TOKEN)" `
  --from-literal=pagesDeployHookUrl="$($env:PAGES_DEPLOY_HOOK_URL)" `
  --from-literal=dashboardAssistantApiKey="$assistantApiKey" `
  --from-literal=dashboardAssistantGeminiApiKey="$geminiApiKey" `
  --dry-run=client `
  -o yaml | kubectl apply -f -

Write-Output "Applied secret $secretName in namespace $namespace."
