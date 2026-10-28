"""Test exact-byte/source/archive guard failures with synthetic fixtures only."""
import importlib.util,hashlib,json,subprocess,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('proof',Path(__file__).resolve().parents[1]/'scripts/verify-prior-runtime-evidence.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class GuardTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.apk=self.root/'candidate.apk';self.apk.write_bytes(b'synthetic-test-apk');self.digest=hashlib.sha256(self.apk.read_bytes()).hexdigest();self.archive=self.root/'prior.zip'
  self.data={'SOURCE_COMMIT.txt':m.PRIOR_SOURCE,'apk-verification.json':json.dumps({'status':'verified','package':'app.usspace.couple.v012','version_code':20,'version_name':'0.18.0','apk_sha256':self.digest,'signing_sha256':'b5edfcc256feb46edc9fa4f2c4e95aeae3a8572b248ef234ba2a61b4eaefc308'})}
  for name in m.SUITES:self.data[name]=json.dumps({'status':'passed','steps':[{'actual-ui-fixture':True}]})
 def tearDown(self):self.tmp.cleanup()
 def check(self,git_error=None):
  with zipfile.ZipFile(self.archive,'w') as z:
   for k,v in self.data.items():z.writestr(k,v)
  with patch.object(m,'PRIOR_APK_SHA256',self.digest),patch.object(m,'PRIOR_ZIP_SHA256',hashlib.sha256(self.archive.read_bytes()).hexdigest()),patch.object(m.subprocess,'run',side_effect=git_error) as git:
   result=m.verify(self.apk,self.archive,self.root);self.assertIn('app/',git.call_args.args[0]);return result
 def test_identical_binary_and_passed_unmodified_suites_can_be_reused(self):self.assertEqual(len(self.check()['reused_suites']),5)
 def test_changed_apk_cannot_reuse(self):
  self.apk.write_bytes(b'different APK')
  with self.assertRaisesRegex(ValueError,'bytes changed'):self.check()
 def test_source_changes_cannot_reuse(self):
  with self.assertRaises(subprocess.CalledProcessError):self.check(subprocess.CalledProcessError(1,['git','diff']))
 def test_wrong_source_identity_cannot_reuse(self):
  self.data['SOURCE_COMMIT.txt']='0'*40
  with self.assertRaisesRegex(ValueError,'source identity'):self.check()
 def test_wrong_signer_cannot_reuse(self):
  d=json.loads(self.data['apk-verification.json']);d['signing_sha256']='0'*64;self.data['apk-verification.json']=json.dumps(d)
  with self.assertRaisesRegex(ValueError,'signature/version'):self.check()
 def test_failed_or_empty_suites_cannot_reuse(self):
  for report in [{'status':'failed','steps':[1]},{'status':'passed','steps':[]}]:
   self.data[m.SUITES[0]]=json.dumps(report)
   with self.assertRaisesRegex(ValueError,'did not pass'):self.check()
 def test_fabricated_ui_evidence_cannot_reuse(self):
  self.data[m.SUITES[0]]=json.dumps({'status':'passed','steps':[1],'javascript_injected':True})
  with self.assertRaisesRegex(ValueError,'unsupported test mechanism'):self.check()
 def test_unpinned_archive_cannot_reuse(self):
  self.archive.write_bytes(b'not the pinned ZIP')
  with patch.object(m,'PRIOR_APK_SHA256',self.digest):
   with self.assertRaisesRegex(ValueError,'archive checksum'):m.verify(self.apk,self.archive,self.root)
if __name__=='__main__':unittest.main()
