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
  node firebase-tests/preferences_feature_test.js
  node firebase-tests/work_schedule_feature_test.js
  node firebase-tests/v014_push_test.mjs
  node functions/test/reliability.test.mjs
  node functions/test/relay.test.mjs
  node firebase-tests/v014_integration_test.js
  node firebase-tests/relationship_feature_test.js
  node firebase-tests/navigation_feature_test.js
  node firebase-tests/health_sync_feature_test.js
  node firebase-tests/travel_models_test.js
  node firebase-tests/travel_store_test.js
  node firebase-tests/travel_ui_test.js
  node firebase-tests/travel_map_test.js
  node firebase-tests/travel_trips_test.js
  bash scripts/test-rota-parser.sh
  bash scripts/test-work-schedule-native.sh
  native_test_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/usspace-sync-tests.XXXXXX")"
  trap 'rm -rf "$native_test_dir"' EXIT
  javac --release 17 -d "$native_test_dir" app/src/main/java/app/usspace/couple/v012/SyncPatchReducer.java firebase-tests/SyncPatchReducerTest.java app/src/main/java/app/usspace/couple/v012/UsExtrasPolicy.java firebase-tests/UsExtrasPolicyTest.java
  java -cp "$native_test_dir" app.usspace.couple.v012.SyncPatchReducerTest
  java -cp "$native_test_dir" app.usspace.couple.v012.UsExtrasPolicyTest
  javac --release 17 -d "$native_test_dir" app/src/main/java/app/usspace/couple/v012/PreferencePolicy.java firebase-tests/PreferencePolicyTest.java app/src/main/java/app/usspace/couple/v012/NotificationPolicy.java firebase-tests/NotificationPolicyTest.java
  java -cp "$native_test_dir" app.usspace.couple.v012.PreferencePolicyTest
  java -cp "$native_test_dir" app.usspace.couple.v012.NotificationPolicyTest
  javac --release 17 -d "$native_test_dir" app/src/main/java/app/usspace/couple/v012/RelationshipPolicy.java firebase-tests/RelationshipPolicyTest.java
  java -cp "$native_test_dir" RelationshipPolicyTest
  javac --release 17 -d "$native_test_dir" app/src/main/java/app/usspace/couple/v012/PushEventPolicy.java firebase-tests/PushEventPolicyTest.java
  java -cp "$native_test_dir" app.usspace.couple.v012.PushEventPolicyTest
  javac --release 17 -d "$native_test_dir" app/src/main/java/app/usspace/couple/v012/HealthSyncPolicy.java firebase-tests/HealthSyncPolicyTest.java
  java -cp "$native_test_dir" HealthSyncPolicyTest
  javac --release 17 -d "$native_test_dir" app/src/main/java/app/usspace/couple/v012/TravelImportPolicy.java firebase-tests/TravelImportPolicyTest.java
  java -cp "$native_test_dir" TravelImportPolicyTest
  javac --release 17 -d "$native_test_dir" app/src/main/java/app/usspace/couple/v012/TravelQueuePolicy.java firebase-tests/TravelQueuePolicyTest.java
  java -cp "$native_test_dir" TravelQueuePolicyTest
  npm --prefix firebase-tests ci --ignore-scripts --no-audit --no-fund
  (
    cd firebase-tests
    npm run test:emulator
  )
} 2>&1 | tee artifacts/firebase-realtime-tests.log
