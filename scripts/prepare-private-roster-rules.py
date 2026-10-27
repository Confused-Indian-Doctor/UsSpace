#!/usr/bin/env python3
"""Derive the private-roster deployment stage from existing verified rule functions."""
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
source = (root / 'firestore.rules').read_text()
marker = '    // Independent owner-controlled consent, bound to both current membership generations.'
if source.count(marker) != 1 or source.count('    function rosterEvent(') != 1:
    raise SystemExit('Rules structure changed; review private-stage derivation.')
prefix = source.split(marker)[0]
roster = source[source.index('    function rosterEvent('):source.index('    match /users/{uid}/rosterPublic/')]
expected = prefix + '    // Private roster stage: sharing and health/cycle grants remain unavailable.\n' + roster + '  }\n}\n'
target = root / 'firestore.roster-private.rules'
if '--check' in sys.argv:
    if not target.is_file() or target.read_text() != expected:
        raise SystemExit('Private roster rules are stale; regenerate, review and verify before deployment.')
    print('Verified staged private roster rules match their existing rule source.')
else:
    target.write_text(expected)
    print('Generated staged private roster rules; emulator verification is still required.')
