# =============================================================================
# deploy-amplify.ps1 — deploy TriageFlow to AWS Amplify Hosting
#
# Default mode (Workshop Studio accounts, which block creating IAM roles):
#   Copies the temporary AWS credentials from THIS terminal into the Amplify
#   app as TF_* env vars, so the hosted app can call Bedrock.
#   - They expire. When they do, the site falls back to the rule-based
#     planner. Get fresh credentials, then run scripts\refresh-creds.ps1.
#   - They are stored in the Amplify app settings (server-side only).
#
# Keyless mode, if you have a role that trusts amplify.amazonaws.com:
#   ...\deploy-amplify.ps1 -ExistingRoleArn arn:aws:iam::<acct>:role/<name>
#
# Run from the repo root, in the terminal where you set $Env:AWS_...:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-amplify.ps1
#
# Safe to re-run: reuses the existing app and branch.
# Undo everything:  aws amplify delete-app --region us-east-1 --app-id <id>
# =============================================================================

param([string]$ExistingRoleArn = "")

# "Continue", not "Stop": in Windows PowerShell 5.1, "Stop" turns any AWS CLI
# stderr line into a fatal error. Failures are caught via $LASTEXITCODE instead.
$ErrorActionPreference = "Continue"

$Region  = "us-east-1"
$AppName = "triageflow"
$Repo    = "https://github.com/tangtangtann/Group-29"
$Branch  = "main"
$ModelId = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

function Invoke-Aws {
    # Runs the AWS CLI and stops the script on any failure.
    $out = & aws @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nAWS CLI failed: aws $($args[0]) $($args[1])" -ForegroundColor Red
        Write-Host ($out | Out-String) -ForegroundColor Red
        exit 1
    }
    return ($out | Out-String).Trim()
}

function Read-Secret([string]$prompt) {
    $s = Read-Host $prompt -AsSecureString
    return [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "AWS CLI not found. Install it: winget install --id Amazon.AWSCLI -e" -ForegroundColor Red
    exit 1
}

# --- 1. Credentials ------------------------------------------------------------
Write-Host "[1/4] Checking AWS credentials..." -ForegroundColor Cyan
$account = Invoke-Aws sts get-caller-identity --query Account --output text --region $Region
Write-Host "      Account: $account"

$envMap = [ordered]@{
    BEDROCK_ENABLED  = "true"
    BEDROCK_REGION   = $Region
    BEDROCK_MODEL_ID = $ModelId
}
if ($ExistingRoleArn) {
    Write-Host "      Keyless mode, role: $ExistingRoleArn"
} else {
    if (-not $env:AWS_ACCESS_KEY_ID -or -not $env:AWS_SECRET_ACCESS_KEY) {
        Write-Host "      Set `$Env:AWS_ACCESS_KEY_ID, `$Env:AWS_SECRET_ACCESS_KEY and" -ForegroundColor Red
        Write-Host "      `$Env:AWS_SESSION_TOKEN in this terminal first." -ForegroundColor Red
        exit 1
    }
    $envMap.TF_ACCESS_KEY_ID     = $env:AWS_ACCESS_KEY_ID
    $envMap.TF_SECRET_ACCESS_KEY = $env:AWS_SECRET_ACCESS_KEY
    if ($env:AWS_SESSION_TOKEN) { $envMap.TF_SESSION_TOKEN = $env:AWS_SESSION_TOKEN }
    Write-Host "      Using this terminal's temporary credentials (they will expire)." -ForegroundColor Yellow
}

# Env vars go through a JSON file: session tokens contain characters that
# break the CLI's KEY=VALUE shorthand. The file is deleted in 'finally'.
$tmp = Join-Path $env:TEMP "triageflow-deploy"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$envFile = Join-Path $tmp "env.json"

try {
    # ASCII avoids a BOM, which the AWS CLI rejects in JSON files.
    ($envMap | ConvertTo-Json -Compress) | Set-Content -Path $envFile -Encoding Ascii

    # --- 2. Amplify app ----------------------------------------------------------
    Write-Host "[2/4] Amplify app '$AppName'..." -ForegroundColor Cyan
    $appId = Invoke-Aws amplify list-apps --region $Region `
        --query "apps[?name=='$AppName'].appId | [0]" --output text

    $roleArgs = @()
    if ($ExistingRoleArn) { $roleArgs = @("--compute-role-arn", $ExistingRoleArn) }

    if ($appId -and $appId -ne "None") {
        Invoke-Aws amplify update-app --region $Region --app-id $appId `
            --environment-variables "file://$envFile" @roleArgs | Out-Null
        Write-Host "      Exists ($appId), settings updated."
    } else {
        Write-Host "      Amplify needs a GitHub personal access token to connect the repo."
        Write-Host "      Create one at https://github.com/settings/tokens (classic, scopes: repo, admin:repo_hook)."
        Write-Host "      It is used once and not stored."
        $ghToken = Read-Secret "      GitHub token"

        Write-Host "      Protect the site with a password? Without one, anyone with the URL"
        Write-Host "      can trigger Bedrock calls on this account."
        $usePw = Read-Host "      Enable password? (Y/n)"
        $authArgs = @()
        if ($usePw -ne "n" -and $usePw -ne "N") {
            $pw = Read-Secret "      Site password for user 'judge'"
            $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("judge:$pw"))
            $authArgs = @("--enable-basic-auth", "--basic-auth-credentials", $basic)
        }

        $appId = Invoke-Aws amplify create-app --region $Region `
            --name $AppName --repository $Repo --access-token $ghToken `
            --platform WEB_COMPUTE `
            --environment-variables "file://$envFile" `
            @roleArgs @authArgs `
            --query app.appId --output text
        $ghToken = $null
        Write-Host "      Created: $appId"
    }

    # --- 3. Branch ---------------------------------------------------------------
    Write-Host "[3/4] Branch '$Branch'..." -ForegroundColor Cyan
    & aws amplify get-branch --region $Region --app-id $appId --branch-name $Branch 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Already connected."
    } else {
        Invoke-Aws amplify create-branch --region $Region --app-id $appId `
            --branch-name $Branch --framework "Next.js - SSR" --stage PRODUCTION `
            --enable-auto-build | Out-Null
        Write-Host "      Connected (auto-builds on every push)."
    }

    # --- 4. Build ----------------------------------------------------------------
    Write-Host "[4/4] Starting build..." -ForegroundColor Cyan
    $jobId = Invoke-Aws amplify start-job --region $Region --app-id $appId `
        --branch-name $Branch --job-type RELEASE --query jobSummary.jobId --output text

    Write-Host ""
    Write-Host "Build $jobId started (about 3-6 minutes)." -ForegroundColor Green
    Write-Host "Watch:  https://$Region.console.aws.amazon.com/amplify/apps/$appId/branches/$Branch/deployments"
    Write-Host "Status: aws amplify get-job --region $Region --app-id $appId --branch-name $Branch --job-id $jobId --query job.summary.status"
    Write-Host "URL:    https://$Branch.$appId.amplifyapp.com" -ForegroundColor Green
}
finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
