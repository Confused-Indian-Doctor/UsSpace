#!/usr/bin/env python3
"""Split exact compiler bytes for bounded transfer; never alter an APK or signing key."""
import argparse
import hashlib
import json
from pathlib import Path


def split(inputs, chunk_bytes=20 * 1024 * 1024):
    inputs = Path(inputs)
    apk = inputs / 'app-release-unsigned.apk'
    if not 1 <= chunk_bytes <= 20 * 1024 * 1024:
        raise ValueError('Invalid transfer bound')
    size = apk.stat().st_size
    if not 0 < size <= 100 * 1024 * 1024:
        raise ValueError('APK outside supported transfer size')
    source = (inputs / 'SOURCE_COMMIT.txt').read_text().strip()
    if len(source) != 40 or any(c not in '0123456789abcdef' for c in source):
        raise ValueError('Invalid source provenance')
    destination = inputs.parent / 'apk-parts'
    destination.mkdir(exist_ok=True)
    digest = hashlib.sha256()
    parts = []
    with apk.open('rb') as stream:
        while True:
            content = stream.read(chunk_bytes)
            if not content:
                break
            name = f'part-{len(parts):03d}.bin'
            (destination / name).write_bytes(content)
            digest.update(content)
            parts.append({'name': name, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
    result = {'source_commit': source, 'unsigned_bytes': size, 'unsigned_sha256': digest.hexdigest(), 'parts': parts}
    (inputs / 'APK-PARTS.json').write_text(json.dumps(result, indent=2) + '\n')
    apk.unlink()
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('inputs')
    args = parser.parse_args()
    result = split(args.inputs)
    print(f"Exact unsigned APK: {result['unsigned_bytes']} bytes in {len(result['parts'])} checksum-verified parts")
