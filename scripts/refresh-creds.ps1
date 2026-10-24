# =============================================================================
# refresh-creds.ps1 — push fresh temporary AWS credentials to the hosted app
#
# Use when the hosted site's badge shows "Rule-based fallback" because the
# workshop session expired. Get new credentials from the access portal, set
# the $Env:AWS_... lines in this terminal, then run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\refresh-creds.ps1
# =============================================================================

$ErrorActionPreference = "Continue"

$Region  = "us-east-1"
$AppName = "triageflow"
$Branch  = "main"
$ModelId = "us.anthropic.claude-sonnet-5-5"

function Invoke-Aws {
    $out = & aws @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nAWS CLI failed: aws $($args[0]) $($args[1])" -ForegroundColor Red
        Write-Host ($out | Out-String) -ForegroundColor Red
        exit 1
    }
    return ($out | Out-String).Trim()
}

if (-not $env:AWS_ACCESS_KEY_ID -or -not $env:AWS_SECRET_ACCESS_KEY) {
    Write-Host "Set `$Env:AWS_ACCESS_KEY_ID, `$Env:AWS_SECRET_ACCESS_KEY and `$Env:AWS_SESSION_TOKEN first." -ForegroundColor Red
    exit 1
}

Invoke-Aws sts get-caller-identity --region $Region | Out-Null   # fails fast if expired

$appId = Invoke-Aws amplify list-apps --region $Region `
    --query "apps[?name=='$AppName'].appId | [0]" --output text
if (-not $appId -or $appId -eq "None") {
    Write-Host "No Amplify app named '$AppName'. Run scripts\deploy-amplify.ps1 first." -ForegroundColor Red
    exit 1
}

# update-app replaces the whole env map, so the BEDROCK_* values are re-sent.
$envMap = [ordered]@{
    BEDROCK_ENABLED      = "true"
    BEDROCK_REGION       = $Region
    BEDROCK_MODEL_ID     = $ModelId
    TF_ACCESS_KEY_ID     = $env:AWS_ACCESS_KEY_ID
    TF_SECRET_ACCESS_KEY = $env:AWS_SECRET_ACCESS_KEY
}
if ($env:AWS_SESSION_TOKEN) { $envMap.TF_SESSION_TOKEN = $env:AWS_SESSION_TOKEN }

$tmp = Join-Path $env:TEMP "triageflow-refresh"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$envFile = Join-Path $tmp "env.json"
try {
    ($envMap | ConvertTo-Json -Compress) | Set-Content -Path $envFile -Encoding Ascii
    Invoke-Aws amplify update-app --region $Region --app-id $appId `
        --environment-variables "file://$envFile" | Out-Null

    # Amplify runs one build per branch at a time (a git push starts one).
    # Wait for it, then rebuild so the new settings are baked in.
    while ($true) {
        $latest = & aws amplify list-jobs --region $Region --app-id $appId `
            --branch-name $Branch --max-items 1 `
            --query "jobSummaries[0].status" --output text 2>$null
        if ($latest -notin "PENDING", "PROVISIONING", "RUNNING", "CANCELLING") { break }
        Write-Host "Waiting for the current build to finish ($latest)..."
        Start-Sleep -Seconds 20
    }

    # Credentials are baked in at build time, so a rebuild is required.
    $jobId = Invoke-Aws amplify start-job --region $Region --app-id $appId `
        --branch-name $Branch --job-type RELEASE --query jobSummary.jobId --output text
    Write-Host "Credentials updated. Rebuild $jobId started (about 3-6 minutes)." -ForegroundColor Green
    Write-Host "URL: https://$Branch.$appId.amplifyapp.com"
}
finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
