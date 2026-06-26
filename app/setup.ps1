# Generates the native Android/iOS/web/Windows folders for Glowbloom WITHOUT
# ever touching your app code in lib/ or pubspec.yaml.
# Run from the app/ folder:
#   powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = "Stop"

# 0) Self-heal: if an earlier interrupted run left your code as lib_bak, restore it.
if (-not (Test-Path "lib") -and (Test-Path "lib_bak")) {
  Write-Host "Restoring lib/ from a previous interrupted run..."
  Rename-Item "lib_bak" "lib"
}
if (Test-Path "pubspec_bak.yaml") { Remove-Item "pubspec_bak.yaml" -Force }

# 1) Require Flutter to be installed and on PATH.
if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  Write-Error "Flutter is not installed or not on PATH. Install it (see TEST_ON_LAPTOP.md), open a NEW terminal, run 'flutter --version' to confirm, then re-run this script."
  exit 1
}

# 2) Scaffold native folders in a temp project, then copy them in. lib/ is never moved.
$tmp = Join-Path $env:TEMP "glowbloom_scaffold"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }

Write-Host "Generating platform scaffolding..."
flutter create --org com.treeants --project-name glowbloom --platforms android,ios,web,windows $tmp

Write-Host "Copying android / ios / web / windows into the project..."
foreach ($item in @("android","ios","web","windows",".metadata")) {
  $src = Join-Path $tmp $item
  if (Test-Path $src) { Copy-Item $src "." -Recurse -Force }
}
Remove-Item $tmp -Recurse -Force

Write-Host "Fetching packages..."
flutter pub get

Write-Host "Done. Now run:  flutter run -d chrome"
