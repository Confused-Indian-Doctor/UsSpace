#!/usr/bin/env bash
# Boots a disposable emulator, or validates an already booted emulator with --existing-device.
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ] || { [ "$#" -eq 3 ] && [ "$3" != --existing-device ]; }; then
  echo "Usage: $0 APK OUTPUT_DIR [--existing-device]" >&2
  exit 2
fi

apk=$(realpath "$1")
mkdir -p "$2"
output=$(realpath "$2")
package=app.usspace.couple.v012
activity="$package/.MainActivity"
sdk=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}
if [ -z "$sdk" ]; then
  echo 'ERROR: Set ANDROID_SDK_ROOT or ANDROID_HOME.' >&2
  exit 2
fi
adb_bin="$sdk/platform-tools/adb"
serial=${ANDROID_SERIAL:-emulator-5554}
boot_timeout=${BOOT_TIMEOUT_SECONDS:-300}
observe_seconds=${CRASH_OBSERVE_SECONDS:-20}
for duration in "$boot_timeout" "$observe_seconds"; do
  if ! [[ "$duration" =~ ^[1-9][0-9]*$ ]]; then
    echo 'ERROR: Timeouts must be positive seconds.' >&2
    exit 2
  fi
done
emulator_pid=

adb_device() {
  timeout 30 "$adb_bin" -s "$serial" "$@"
}

collect_logs() {
  adb_device logcat -b all -d -v threadtime > "$output/logcat.txt" 2>&1 || true
  adb_device logcat -b crash -d -v threadtime > "$output/crash-logcat.txt" 2>&1 || true
  adb_device shell dumpsys activity activities > "$output/activity.txt" 2>&1 || true
}

cleanup() {
  status=$?
  trap - EXIT
  collect_logs
  if [ -n "$emulator_pid" ]; then
    adb_device emu kill >/dev/null 2>&1 || true
    kill -9 "$emulator_pid" 2>/dev/null || true
    wait "$emulator_pid" 2>/dev/null || true
  fi
  if [ "$status" -ne 0 ]; then
    echo "ERROR: Android smoke test failed. Logs are in $output." >&2
    tail -n 60 "$output/logcat.txt" >&2 || true
    if [ -f "$output/emulator.log" ]; then tail -n 30 "$output/emulator.log" >&2 || true; fi
  fi
  exit "$status"
}
trap cleanup EXIT

if [ "${3:-}" != --existing-device ]; then
  if ! [[ "$serial" =~ ^emulator-([0-9]+)$ ]]; then
    echo 'ERROR: A launched emulator needs an emulator-PORT serial.' >&2
    exit 2
  fi
  port=${BASH_REMATCH[1]}
  if "$adb_bin" devices | awk 'NR > 1 {print $1}' | grep -Fxq "$serial"; then
    echo "ERROR: $serial is already running; use --existing-device or choose another ANDROID_SERIAL." >&2
    exit 2
  fi
  avd_name=${USSPACE_AVD_NAME:-usspace-ci}
  avdmanager_bin=$(command -v avdmanager || true)
  if [ -z "$avdmanager_bin" ]; then
    echo 'ERROR: avdmanager must be on PATH.' >&2
    exit 2
  fi
  "$avdmanager_bin" create avd -n "$avd_name" -k "system-images;android-${ANDROID_API:-35};google_apis;x86_64" --force <<< no
  "$sdk/emulator/emulator" -avd "$avd_name" -port "$port" -no-window -no-audio -no-boot-anim \
    -gpu swiftshader_indirect -accel "${ANDROID_EMULATOR_ACCEL:-on}" -no-snapshot -wipe-data \
    > "$output/emulator.log" 2>&1 &
  emulator_pid=$!
else
  printf 'Using existing Android device: %s\n' "$serial" > "$output/emulator-session.txt"
fi

# Both device discovery and Android boot completion have an overall deadline.
deadline=$((SECONDS + boot_timeout))
timeout "$boot_timeout" "$adb_bin" -s "$serial" wait-for-device
until [ "$(adb_device shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
  if [ -n "$emulator_pid" ] && ! kill -0 "$emulator_pid" 2>/dev/null; then
    echo 'ERROR: Emulator exited before Android booted.' >&2
    exit 1
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "ERROR: Android did not finish booting within $boot_timeout seconds." >&2
    exit 1
  fi
  sleep 2
done

adb_device shell input keyevent 82
adb_device install -r "$apk" | tr -d '\r' | tee "$output/install.txt"
grep -qx 'Success' "$output/install.txt"
adb_device shell am force-stop "$package"
adb_device logcat -b all -c
adb_device shell am start -W -n "$activity" | tr -d '\r' | tee "$output/launch.txt"
grep -qx 'Status: ok' "$output/launch.txt"

deadline=$((SECONDS + observe_seconds))
while [ "$SECONDS" -lt "$deadline" ]; do
  if ! adb_device shell pidof "$package" > "$output/app-pid.txt"; then
    echo 'ERROR: App process exited during launch observation.' >&2
    exit 1
  fi
  sleep 1
done
collect_logs
if grep -Eq 'Uncaught (ReferenceError|TypeError|SyntaxError|RangeError|Error)' "$output/logcat.txt"; then
  echo 'ERROR: Uncaught JavaScript error in the bundled app.' >&2
  exit 1
fi
if grep -Eq "Process: $package([,[:space:]]|$)|>>> $package <<<|ANR in $package([[:space:]]|$)|am_crash.*$package|am_anr.*$package" "$output/logcat.txt"; then
  echo 'ERROR: App crash or ANR was found in logcat.' >&2
  exit 1
fi
if ! grep -Eq "(mResumedActivity|topResumedActivity).*${package//./\\.}/(\.MainActivity|${package//./\\.}\.MainActivity)" "$output/activity.txt"; then
  echo 'ERROR: MainActivity is not the resumed activity.' >&2
  exit 1
fi
adb_device exec-out screencap -p > "$output/UsSpace-v0.12-launch.png"
test -s "$output/UsSpace-v0.12-launch.png"
python3 - "$output/UsSpace-v0.12-launch.png" <<'PY'
from pathlib import Path
import sys
if Path(sys.argv[1]).read_bytes()[:8] != b'\x89PNG\r\n\x1a\n':
    raise SystemExit('ERROR: Emulator screenshot is not a PNG.')
PY
adb_device shell getprop ro.build.version.sdk > "$output/android-api.txt"
python3 scripts/android-learning-smoke.py --adb "$adb_bin" --serial "$serial" --output "$output"
if ! adb_device shell pidof "$package" > "$output/app-pid.txt"; then
  echo 'ERROR: App process exited during learning navigation or Google sign-in.' >&2
  exit 1
fi
collect_logs
if grep -Eq 'Uncaught (ReferenceError|TypeError|SyntaxError|RangeError|Error)' "$output/logcat.txt"; then
  echo 'ERROR: Uncaught JavaScript error during learning navigation or Google sign-in.' >&2
  exit 1
fi
if grep -Eq "Process: $package([,[:space:]]|$)|>>> $package <<<|ANR in $package([[:space:]]|$)|am_crash.*$package|am_anr.*$package" "$output/logcat.txt"; then
  echo 'ERROR: App crash or ANR during learning navigation or Google sign-in.' >&2
  exit 1
fi
printf '{"status":"passed","package":"%s","serial":"%s","observation_seconds":%s,"google_signin_handoff":"passed","authenticated_success_verified":false}\n' \
  "$package" "$serial" "$observe_seconds" > "$output/smoke-result.json"
echo "ANDROID_SMOKE_TEST_PASSED: $package remained running and resumed for $observe_seconds seconds."
