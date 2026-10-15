#!/usr/bin/env bash
# Called inside Firebase emulators:exec; only disposable demo data is created.
set -euo pipefail
export GCLOUD_PROJECT=demo-usspace
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
node scripts/seed-travel-runtime.mjs
adb -s emulator-5554 install -r artifacts/travel-runtime-test.apk | tee artifacts/travel-test-install.txt
rg -qx 'Success' artifacts/travel-test-install.txt
adb -s emulator-5554 shell am force-stop app.usspace.couple.v012
adb -s emulator-5554 shell am instrument -w app.usspace.couple.v012.test/app.usspace.couple.v012.TravelRuntimeInstrumentation > artifacts/travel-instrumentation.txt 2>&1 &
travel_instrumentation_pid=$!
trap 'kill "$travel_instrumentation_pid" 2>/dev/null || true' EXIT
python3 scripts/android-travel-smoke.py --adb adb --serial emulator-5554 --output artifacts
adb -s emulator-5554 logcat -d -s UsSpaceTravelQA:I > artifacts/travel-native-qa.log
