#!/usr/bin/env python3
"""Verify a release APK and its Google Sign-In certificate registration."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


PACKAGE = "app.usspace.couple.v012"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--config", type=Path, default=Path(__file__).resolve().parents[1] / "app/google-services.json")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    sdk = os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME")
    if not sdk:
        raise ValueError("Set ANDROID_SDK_ROOT or ANDROID_HOME to the Android SDK directory.")
    tools = Path(sdk) / "build-tools" / os.environ.get("ANDROID_BUILD_TOOLS", "35.0.0")
    if not args.apk.is_file():
        raise ValueError(f"APK is missing: {args.apk}")

    verified = subprocess.run(
        [str(tools / "apksigner"), "verify", "--verbose", "--print-certs", str(args.apk)],
        check=True, capture_output=True, text=True,
    )
    print(verified.stdout, end="")
    signer_sha1s = re.findall(r"Signer #\d+ certificate SHA-1 digest:\s*([0-9a-fA-F:]+)", verified.stdout)
    if len(signer_sha1s) != 1:
        raise ValueError("Expected exactly one verified APK signing certificate.")
    sha1 = signer_sha1s[0].replace(":", "").lower()
    config = json.loads(args.config.read_text())
    clients = [client for client in config.get("client", [])
               if client.get("client_info", {}).get("android_client_info", {}).get("package_name") == PACKAGE]
    oauth = [client for match in clients for client in match.get("oauth_client", [])]
    if not any(client.get("client_type") == 3 and client.get("client_id") for client in oauth):
        raise ValueError("Firebase config is missing the Web OAuth client used by Google Sign-In.")
    registered = {
        client.get("android_info", {}).get("certificate_hash", "").replace(":", "").lower()
        for client in oauth
        if client.get("client_type") == 1
        and client.get("android_info", {}).get("package_name") == PACKAGE
    }
    if sha1 not in registered:
        raise ValueError(
            f"APK signing SHA-1 {sha1} is not registered for {PACKAGE} in google-services.json. "
            "Use the stable signing key, or register its certificate in Firebase and download the updated config."
        )

    badging = subprocess.run([str(tools / "aapt"), "dump", "badging", str(args.apk)],
                             check=True, capture_output=True, text=True).stdout
    identity = re.search(r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging, re.MULTILINE)
    if not identity or identity.groups() != (PACKAGE, "14", "0.12.2"):
        raise ValueError("APK identity must be app.usspace.couple.v012, versionCode 14, versionName 0.12.2.")
    report = {
        "status": "verified",
        "package": PACKAGE,
        "version_code": 14,
        "version_name": "0.12.2",
        "firebase_project": config.get("project_info", {}).get("project_id"),
        "signing_sha1": sha1,
        "apk_sha256": hashlib.sha256(args.apk.read_bytes()).hexdigest(),
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stdout or "", file=sys.stderr)
            print(error.stderr or "", file=sys.stderr)
        sys.exit(1)
