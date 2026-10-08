#!/usr/bin/env bash
set -euo pipefail
WORK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_BUILD="$(mktemp -d "${TMPDIR:-/tmp}/usspace-work-test.XXXXXX")"
trap 'rm -rf -- "$WORK_BUILD"' EXIT
java -m jdk.compiler/com.sun.tools.javac.Main -encoding UTF-8 -d "$WORK_BUILD" \
  "$WORK_ROOT/app/src/main/java/app/usspace/couple/v012/WorkSchedulePolicy.java" \
  "$WORK_ROOT/app/src/main/java/app/usspace/couple/v012/RotaWorkbookReader.java" \
  "$WORK_ROOT/app/src/main/java/app/usspace/couple/v012/RotaParser.java" \
  "$WORK_ROOT/firebase-tests/WorkSchedulePolicyTest.java" \
  "$WORK_ROOT/firebase-tests/RotaParserTest.java"
java -cp "$WORK_BUILD" app.usspace.couple.v012.RotaParserTest
java -cp "$WORK_BUILD" app.usspace.couple.v012.WorkSchedulePolicyTest
