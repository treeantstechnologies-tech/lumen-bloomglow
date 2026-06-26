#!/usr/bin/env bash
# Generates the native Android/iOS/web folders for Glowbloom WITHOUT touching
# your app code in lib/ or pubspec.yaml. Run from the app/ folder: bash setup.sh
set -euo pipefail

# 0) Self-heal a previous interrupted run.
if [ ! -d lib ] && [ -d lib_bak ]; then
  echo "Restoring lib/ from a previous interrupted run..."
  mv lib_bak lib
fi
rm -f pubspec_bak.yaml

# 1) Require Flutter.
if ! command -v flutter >/dev/null 2>&1; then
  echo "ERROR: Flutter is not installed or not on PATH. Install it, open a new terminal, run 'flutter --version', then re-run." >&2
  exit 1
fi

# 2) Scaffold in a temp project and copy native folders in.
TMP="$(mktemp -d)/glowbloom_scaffold"
flutter create --org com.treeants --project-name glowbloom --platforms android,ios,web "$TMP"
for d in android ios web .metadata; do
  [ -e "$TMP/$d" ] && cp -R "$TMP/$d" .
done
rm -rf "$TMP"

flutter pub get
echo "Done. Now run:  flutter run -d chrome"
