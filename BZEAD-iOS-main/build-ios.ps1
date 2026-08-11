# BZEAD iOS — full debug build (Windows + macOS)
# Same idea as BZEAD-APK-main\gradlew.bat assembleDebug
#
# Windows (no Xcode): triggers GitHub Actions on macOS, downloads BZEAD-debug.zip
# macOS (with Xcode): xcodegen + xcodebuild locally
#
# Usage:
#   .\build-ios.ps1
#   .\build-ios.ps1 -LocalOnly    # skip CI, fail if no Xcode

param(
    [switch]$LocalOnly,
    [switch]$SkipCI
)

$ErrorActionPreference = "Stop"
$IosRoot = $PSScriptRoot
$RepoRoot = Split-Path $IosRoot -Parent
$OutApp = Join-Path $IosRoot "BZEAD-debug.app"
$OutZip = Join-Path $IosRoot "BZEAD-debug.zip"

. (Join-Path $IosRoot "scripts\setup-env.ps1")

function Invoke-LocalMacBuild {
    Write-Host "`n==> Local macOS build (xcodegen + xcodebuild)" -ForegroundColor Cyan

    if (-not (Get-Command xcodegen -ErrorAction SilentlyContinue)) {
        throw "xcodegen not found. Install: brew install xcodegen"
    }
    if (-not (Get-Command xcodebuild -ErrorAction SilentlyContinue)) {
        throw "xcodebuild not found. Install Xcode from the Mac App Store."
    }

    Push-Location $IosRoot
    try {
        xcodegen generate
        if ($LASTEXITCODE -ne 0) { throw "xcodegen failed ($LASTEXITCODE)" }

        $sim = "iPhone 16"
        xcodebuild `
            -scheme BZEAD `
            -destination "platform=iOS Simulator,name=$sim" `
            -configuration Debug `
            -derivedDataPath "$IosRoot\DerivedData" `
            build

        if ($LASTEXITCODE -ne 0) { throw "xcodebuild failed ($LASTEXITCODE)" }

        $builtApp = Get-ChildItem -Path "$IosRoot\DerivedData" -Recurse -Filter "BZEAD.app" -Directory |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1

        if (-not $builtApp) {
            throw "Build succeeded but BZEAD.app not found under DerivedData"
        }

        if (Test-Path $OutApp) { Remove-Item -Recurse -Force $OutApp }
        Copy-Item -Recurse $builtApp.FullName $OutApp
        if (Test-Path $OutZip) { Remove-Item -Force $OutZip }
        Compress-Archive -Path $OutApp -DestinationPath $OutZip -Force

        Write-Host "`nBuild succeeded." -ForegroundColor Green
        Write-Host "  App: $OutApp"
        Write-Host "  Zip: $OutZip"
    }
    finally {
        Pop-Location
    }
}

function Invoke-CloudMacBuild {
    Write-Host "`n==> Cloud macOS build (GitHub Actions)" -ForegroundColor Cyan

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw @"
GitHub CLI (gh) not found. Install from https://cli.github.com/
Or build on a Mac: install Xcode + xcodegen, then run .\build-ios.ps1 -LocalOnly
"@
    }

    gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Run: gh auth login"
    }

    Push-Location $RepoRoot
    try {
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        $status = git status --porcelain "BZEAD-iOS-main" ".github/workflows/ios-native-build.yml" 2>$null
        if ($status) {
            Write-Host "Committing iOS project + workflow for CI..." -ForegroundColor Yellow
            git add BZEAD-iOS-main ".github/workflows/ios-native-build.yml"
            git add .gitignore AGENT_RULES.md DEVELOPER_GUIDE.md 2>$null
            git commit -m "Add native iOS buyer app and macOS CI build workflow." 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Nothing new to commit or commit failed — continuing with existing remote branch."
            } else {
                git push origin $branch
                if ($LASTEXITCODE -ne 0) { throw "git push failed — push BZEAD-iOS-main manually then re-run." }
            }
        }

        Write-Host "Dispatching iOS Native Build workflow on branch $branch ..."
        gh workflow run "iOS Native Build" --ref $branch
        if ($LASTEXITCODE -ne 0) { throw "gh workflow run failed" }

        Start-Sleep -Seconds 8
        $runId = gh run list --workflow="iOS Native Build" --limit 1 --json databaseId --jq ".[0].databaseId"
        if (-not $runId) { throw "Could not find workflow run id" }

        Write-Host "Waiting for run $runId (macOS runner, ~5-15 min)..."
        gh run watch $runId --exit-status
        if ($LASTEXITCODE -ne 0) {
            $conclusion = gh run view $runId --json conclusion --jq .conclusion 2>$null
            if ($conclusion -eq "startup_failure") {
                throw @"
GitHub Actions could not start a macOS runner (startup_failure).
Private repos need GitHub billing for macOS builds: https://github.com/settings/billing
Or build on a Mac: install Xcode + xcodegen, then run .\build-ios.ps1 -LocalOnly
Run logs: gh run view $runId --log
"@
            }
            throw "GitHub Actions build failed. See: gh run view $runId --log"
        }

        $artifactDir = Join-Path $IosRoot "build\ci-artifacts"
        if (Test-Path $artifactDir) { Remove-Item -Recurse -Force $artifactDir }
        New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null

        gh run download $runId --dir $artifactDir
        if ($LASTEXITCODE -ne 0) { throw "Artifact download failed" }

        $downloadedZip = Get-ChildItem -Path $artifactDir -Recurse -Filter "BZEAD-debug.zip" | Select-Object -First 1
        if (-not $downloadedZip) {
            $downloadedZip = Get-ChildItem -Path $artifactDir -Recurse -Filter "*.zip" | Select-Object -First 1
        }
        if (-not $downloadedZip) { throw "BZEAD-debug.zip artifact not found" }

        Copy-Item $downloadedZip.FullName $OutZip -Force
        if (Test-Path $OutApp) { Remove-Item -Recurse -Force $OutApp }
        Expand-Archive -Path $OutZip -DestinationPath $IosRoot -Force

        Write-Host "`nCloud build succeeded." -ForegroundColor Green
        Write-Host "  Zip: $OutZip"
        if (Test-Path $OutApp) { Write-Host "  App: $OutApp" }
    }
    finally {
        Pop-Location
    }
}

Write-Host "BZEAD iOS build" -ForegroundColor Cyan
Write-Host "Project: $IosRoot"

if (Get-Command xcodebuild -ErrorAction SilentlyContinue) {
    Invoke-LocalMacBuild
}
elseif ($LocalOnly) {
    throw "LocalOnly set but xcodebuild not found. iOS builds require macOS + Xcode."
}
elseif (-not $SkipCI) {
    Invoke-CloudMacBuild
}
else {
    throw "No Xcode and SkipCI set — nothing to run."
}
