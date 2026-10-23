#!/usr/bin/env bash
# Called inside Firebase emulators:exec; only disposable demo data is created.
set -euo pipefail
export GCLOUD_PROJECT=demo-usspace
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
node scripts/seed-travel-runtime.mjs
adb -s emulator-5554 install -r artifacts/travel-runtime-test.apk | tee artifacts/travel-test-install.txt
grep -qx 'Success' artifacts/travel-test-install.txt
python3 scripts/android-travel-cold-import.py --adb adb --serial emulator-5554 --output artifacts
adb -s emulator-5554 shell am force-stop app.usspace.couple.v012
adb -s emulator-5554 shell am instrument -w app.usspace.couple.v012.test/app.usspace.couple.v012.TravelRuntimeInstrumentation > artifacts/travel-instrumentation.txt 2>&1 &
travel_instrumentation_pid=$!
trap 'kill "$travel_instrumentation_pid" 2>/dev/null || true' EXIT
if ! python3 scripts/android-travel-smoke.py --adb adb --serial emulator-5554 --output artifacts; then
  node --input-type=module <<'JS'
import {createRequire} from 'node:module';
const require=createRequire(process.cwd()+'/functions/package.json');
if(process.env.GCLOUD_PROJECT!=='demo-usspace'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Demo-only diagnostics');
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const db=getFirestore(initializeApp({projectId:'demo-usspace'}));
const items=await db.collection('users/travel_qa_al/travelItems').get();
const receipts=await db.collection('users/travel_qa_al/travelReceipts').get();
console.log('DEMO_NATIVE_SERVER_DIAGNOSTICS',JSON.stringify({privateItemTitles:items.docs.map(x=>x.data().title),receiptCount:receipts.size}));
JS
  exit 1
fi
node scripts/verify-travel-runtime-state.mjs
python3 scripts/android-travel-unpair.py --adb adb --serial emulator-5554 --output artifacts
adb -s emulator-5554 logcat -d -s UsSpaceTravelQA:I > artifacts/travel-native-qa.log
