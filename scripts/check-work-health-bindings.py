#!/usr/bin/env python3
"""Report binding readiness and original public certificate match; never print secrets."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

EXPECTED_SHA256 = 'B5EDFCC256FEB46EDC9FA4F2C4E95AEAE3A8572B248EF234BA2A61B4EAEFC308'

def main():
    result = {'firebase_admin_json_bound': bool(os.environ.get('USSPACE_FIREBASE_ADMIN_JSON'))}
    path = os.environ.get('USSPACE_KEYSTORE_PATH')
    keytool = shutil.which('keytool')
    password = bool(os.environ.get('USSPACE_KEYSTORE_PASSWORD'))
    result['original_signing_file_bound'] = bool(path and Path(path).is_file())
    result['signing_password_bound'] = password
    result['original_certificate_verified'] = False
    if result['original_signing_file_bound'] and password and keytool:
        try:
            completed = subprocess.run([keytool, '-list', '-v', '-storetype', 'PKCS12',
                '-keystore', path, '-storepass:env', 'USSPACE_KEYSTORE_PASSWORD',
                '-alias', os.environ.get('USSPACE_KEY_ALIAS') or 'usspace'],
                capture_output=True, text=True, timeout=20,
                env={**os.environ, 'LC_ALL': 'C'})
            match = re.search(r'SHA256:\s*([A-Fa-f0-9:]+)', completed.stdout)
            result['original_certificate_verified'] = bool(completed.returncode == 0 and match
                and match.group(1).replace(':', '').upper() == EXPECTED_SHA256)
            if not result['original_certificate_verified']:
                result['signing_status'] = 'unreadable-or-wrong-certificate; do not sign'
        except (OSError, subprocess.TimeoutExpired):
            result['signing_status'] = 'verification-unavailable'
    else:
        result['signing_status'] = 'awaiting-private-file-password-or-keytool'
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    main()
