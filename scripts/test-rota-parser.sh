#!/usr/bin/env bash
set -euo pipefail
ROTA_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ROTA_BUILD="$(mktemp -d "${TMPDIR:-/tmp}/usspace-rota-test.XXXXXX")"
trap 'rm -rf -- "$ROTA_BUILD"' EXIT
java -m jdk.compiler/com.sun.tools.javac.Main -encoding UTF-8 -d "$ROTA_BUILD" \
  "$ROTA_ROOT/app/src/main/java/app/usspace/couple/v012/RotaParser.java" \
  "$ROTA_ROOT/firebase-tests/RotaParserTest.java"
java -cp "$ROTA_BUILD" app.usspace.couple.v012.RotaParserTest
