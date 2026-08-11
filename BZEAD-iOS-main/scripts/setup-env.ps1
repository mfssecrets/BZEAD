# BZEAD iOS — ensure Secrets files exist (same keys as Android local.properties)
# Run: . .\scripts\setup-env.ps1

$ErrorActionPreference = "Stop"
$IosRoot = Split-Path $PSScriptRoot -Parent

$xcconfig = Join-Path $IosRoot "Secrets.xcconfig"
$plist = Join-Path $IosRoot "Secrets.plist"
$androidProps = Join-Path (Split-Path $IosRoot -Parent) "BZEAD-APK-main\local.properties"

function Read-AndroidProperty($name) {
    if (-not (Test-Path $androidProps)) { return $null }
    $line = Get-Content $androidProps | Where-Object { $_ -match "^\s*$name=" } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -split "=", 2)[1].Trim()
}

function Ensure-Secrets {
    $missing = @()
    if (-not (Test-Path $xcconfig)) { $missing += "Secrets.xcconfig" }
    if (-not (Test-Path $plist)) { $missing += "Secrets.plist" }

    if ($missing.Count -gt 0 -and (Test-Path $androidProps)) {
        Write-Host "Creating missing secret files from BZEAD-APK-main/local.properties..."
        $url = Read-AndroidProperty "SUPABASE_URL"
        $anon = Read-AndroidProperty "SUPABASE_ANON_KEY"
        $public = Read-AndroidProperty "PUBLIC_APP_URL"
        $stripe = Read-AndroidProperty "STRIPE_PUBLISHABLE_KEY"
        $oneSignal = Read-AndroidProperty "ONESIGNAL_APP_ID"

        if (-not (Test-Path $xcconfig) -and $url -and $anon) {
            $urlHost = ($url -replace '^https://', '')
            $publicHost = ($public -replace '^https://', '')
            $xc = @(
                "// Auto-generated from Android local.properties"
                "SUPABASE_URL = https:/`$()/$urlHost"
                "SUPABASE_ANON_KEY = $anon"
                "PUBLIC_APP_URL = https:/`$()/$publicHost"
                "STRIPE_PUBLISHABLE_KEY = $stripe"
                "ONESIGNAL_APP_ID = $oneSignal"
            ) -join "`n"
            Set-Content -Path $xcconfig -Value $xc -Encoding UTF8
            Write-Host "  Created Secrets.xcconfig"
        }

        if (-not (Test-Path $plist) -and $url -and $anon) {
            $plistXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>SUPABASE_URL</key>
	<string>$url</string>
	<key>SUPABASE_ANON_KEY</key>
	<string>$anon</string>
	<key>PUBLIC_APP_URL</key>
	<string>$public</string>
	<key>STRIPE_PUBLISHABLE_KEY</key>
	<string>$stripe</string>
	<key>ONESIGNAL_APP_ID</key>
	<string>$oneSignal</string>
</dict>
</plist>
"@
            Set-Content -Path $plist -Value $plistXml -Encoding UTF8
            Write-Host "  Created Secrets.plist"
        }
    }

    if (-not (Test-Path $xcconfig)) {
        throw "Missing Secrets.xcconfig — copy Secrets.xcconfig.example or ensure BZEAD-APK-main/local.properties exists."
    }
    if (-not (Test-Path $plist)) {
        throw "Missing Secrets.plist — copy Secrets.plist.example or ensure BZEAD-APK-main/local.properties exists."
    }
}

Ensure-Secrets
Write-Host "iOS secrets OK ($IosRoot)"
Write-Host "  Secrets.xcconfig"
Write-Host "  Secrets.plist"

if (Get-Command xcodebuild -ErrorAction SilentlyContinue) {
    Write-Host "Xcode detected — local macOS build available."
} else {
    Write-Host "No Xcode on this PC — build-ios.ps1 will use GitHub Actions (macOS runner)."
}
