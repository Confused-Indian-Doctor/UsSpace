#!/usr/bin/env bash
# Run against the demo emulator only. No Firebase account or live data is used.
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"
mkdir -p artifacts
{
  node firebase-tests/privacy_payload_test.js
  node firebase-tests/learning_engine_test.js
  node firebase-tests/app_ui_test.js
  node firebase-tests/realtime_protocol_test.js
  node firebase-tests/us_extras_store_test.js
  node firebase-tests/comfort_feature_test.js
  node firebase-tests/letters_feature_test.js
  node firebase-tests/plans_feature_test.js
  native_test_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/usspace-sync-tests.XXXXXX")"
  trap 'rm -rf "$native_test_dir"' EXIT
  javac --release 17 -d "$native_test_dir" app/src/main/java/app/usspace/couple/v012/SyncPatchReducer.java firebase-tests/SyncPatchReducerTest.java app/src/main/java/app/usspace/couple/v012/UsExtrasPolicy.java firebase-tests/UsExtrasPolicyTest.java
  java -cp "$native_test_dir" app.usspace.couple.v012.SyncPatchReducerTest
  java -cp "$native_test_dir" app.usspace.couple.v012.UsExtrasPolicyTest
  npm --prefix firebase-tests ci --ignore-scripts --no-audit --no-fund
  (
    cd firebase-tests
    npm run test:emulator
  )
} 2>&1 | tee artifacts/firebase-realtime-tests.log
