#!/usr/bin/env bash
# Verify staged private-roster rules with baseline regressions in an isolated source tree.
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"
python3 scripts/prepare-private-roster-rules.py --check
test -d firebase-tests/node_modules || { echo 'Install firebase-tests dependencies first.' >&2; exit 1; }
USSPACE_RULES_VERIFICATION_DIR=$(mktemp -d "${RUNNER_TEMP:-/tmp}/usspace-private-roster.XXXXXX")
export USSPACE_RULES_VERIFICATION_DIR
trap 'rm -rf "$USSPACE_RULES_VERIFICATION_DIR"' EXIT
# Existing rules assertions see the candidate staged rules without altering the working tree.
git archive HEAD | tar -x -C "$USSPACE_RULES_VERIFICATION_DIR"
cp firestore.roster-private.rules "$USSPACE_RULES_VERIFICATION_DIR/firestore.rules"
cp firestore.roster-private.rules "$USSPACE_RULES_VERIFICATION_DIR/firestore.roster-private.rules"
cp firebase-tests/roster_private_stage_test.mjs "$USSPACE_RULES_VERIFICATION_DIR/firebase-tests/roster_private_stage_test.mjs"
ln -s "$root_dir/firebase-tests/node_modules" "$USSPACE_RULES_VERIFICATION_DIR/firebase-tests/node_modules"
mkdir -p artifacts
if [ -n "${USSPACE_FIREBASE_CLI:-}" ]; then
  roster_firebase_cli=("$USSPACE_FIREBASE_CLI")
elif command -v firebase >/dev/null 2>&1; then
  roster_firebase_cli=(firebase)
else
  roster_firebase_cli=(npx --yes firebase-tools@14.12.1)
fi
"${roster_firebase_cli[@]}" emulators:exec --config "$USSPACE_RULES_VERIFICATION_DIR/firebase.json" --only firestore,storage --project demo-usspace 'cd "$USSPACE_RULES_VERIFICATION_DIR/firebase-tests" && node --test --test-concurrency=1 realtime_emulator_test.mjs us_extras_emulator_test.mjs v014_push_emulator_test.mjs relationship_emulator_test.mjs travel_emulator_test.mjs travel_storage_emulator_test.mjs roster_private_stage_test.mjs' 2>&1 | tee artifacts/roster-private-stage-emulator.log
