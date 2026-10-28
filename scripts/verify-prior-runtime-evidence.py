#!/usr/bin/env python3
"""Reuse only pinned, successful UI reports for an exactly identical signed APK."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

PRIOR_RUN = 40598231847
PRIOR_SOURCE = 'bc79f95951393b4ba2fd6a765d414b8086aaf06c'
PRIOR_ZIP_SHA256 = '23388438ec945f6171c59e7a2468f7bf62e0bc5b48ee73a8f64c8c73e40456d7'
PRIOR_APK_SHA256 = '208fef19cd36fe7085ece234df139267c533c64d4570c78511fcf08472613ece'
SUITES = ['learning-ui-result.json', 'us-features-ui-result.json', 'v014-ui-result.json', 'v015-ui-result.json', 'v016-ui-result.json']
SOURCE_PATHS = ['app/', ':(exclude)app/src/androidTest/', 'build.gradle.kts', 'settings.gradle.kts', 'gradle.properties', 'gradle/',
    'scripts/android-learning-smoke.py', 'scripts/android-us-features-smoke.py',
    'scripts/android-v014-smoke.py', 'scripts/android-v015-smoke.py', 'scripts/android-v016-smoke.py', 'scripts/android-upgrade-probe.py']

def verify(apk, archive, repository):
    if hashlib.sha256(apk.read_bytes()).hexdigest() != PRIOR_APK_SHA256:
        raise ValueError('Signed APK bytes changed; run the complete runtime suite.')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != PRIOR_ZIP_SHA256:
        raise ValueError('Prior evidence archive checksum mismatch; run the complete suite.')
    subprocess.run(['git', 'diff', '--exit-code', PRIOR_SOURCE, 'HEAD', '--', *SOURCE_PATHS],
                   cwd=repository, capture_output=True, check=True)
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        if len(names) != len(set(names)) or len(names)>3000 or any(i.file_size>20*1024*1024 for i in z.infolist()):
            raise ValueError('Unsupported evidence archive.')
        def read(name):
            # GitHub upload-artifact placed these reports at the archive root.
            return z.read(name).decode('utf-8')
        if read('SOURCE_COMMIT.txt').strip()!=PRIOR_SOURCE:
            raise ValueError('Prior evidence source identity mismatch.')
        signature=json.loads(read('apk-verification.json'))
        if (signature.get('status'),signature.get('package'),signature.get('version_code'),signature.get('version_name'),
            signature.get('apk_sha256'),signature.get('signing_sha256')) != ('verified','app.usspace.couple.v012',20,'0.18.0',PRIOR_APK_SHA256,
                'b5edfcc256feb46edc9fa4f2c4e95aeae3a8572b248ef234ba2a61b4eaefc308'):
            raise ValueError('Prior APK signature/version report mismatch.')
        summaries=[]
        for name in SUITES:
            report=json.loads(read(name))
            if report.get('status')!='passed' or not report.get('steps'):
                raise ValueError('A required prior suite did not pass.')
            for flag in ['javascript_injected','fabricated_health_records','user_data_cleared','application_private_data_read']:
                if report.get(flag) is True:raise ValueError('Prior evidence used an unsupported test mechanism.')
            summaries.append({'report':name,'recorded_steps':len(report['steps']),'status':'passed'})
    return {'status':'verified-exact-apk-prior-evidence','apk_sha256':PRIOR_APK_SHA256,
        'source_run_id':PRIOR_RUN,'source_commit':PRIOR_SOURCE,'archive_sha256':PRIOR_ZIP_SHA256,
        'reused_suites':summaries,'remaining_required':['upgrade-install','launch','native-travel-runtime']}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,required=True);parser.add_argument('--archive',type=Path,required=True)
    parser.add_argument('--report',type=Path,required=True)
    args=parser.parse_args()
    result=verify(args.apk,args.archive,Path(__file__).resolve().parents[1])
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(result,indent=2)+'\n')
    print('Verified prior passing suites for the exact same signed APK; remaining suites are still mandatory.')

if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError,zipfile.BadZipFile,subprocess.CalledProcessError):
        raise SystemExit('Prior runtime evidence cannot be reused; complete runtime suite required.')
