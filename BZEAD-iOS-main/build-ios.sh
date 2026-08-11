#!/usr/bin/env bash
# Full iOS build on macOS — no previews, no shortcuts.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "Install XcodeGen: brew install xcodegen"
  exit 1
fi

if [[ ! -f Secrets.xcconfig ]]; then
  echo "Missing Secrets.xcconfig — copy Secrets.xcconfig.example and fill keys."
  exit 1
fi

if [[ ! -f Secrets.plist ]]; then
  echo "Missing Secrets.plist — copy Secrets.plist.example and fill keys."
  exit 1
fi

xcodegen generate

xcodebuild \
  -scheme BZEAD \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -configuration Debug \
  build

echo ""
echo "Build succeeded. Open BZEAD.xcodeproj → Product → Run on simulator or device."
