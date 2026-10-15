import styles from "./_index.module.css";
import { Download, ShieldCheck, Smartphone, Heart } from "lucide-react";
const APK_PATH = "https://cb2f5cbc-8097-415e-9aa7-aaa4176cb607.sandbox.floot.app/_cdn/static/a9986d44-129f-4426-aee2-b90b1e9d15f5-UsSpace-v0.15.0.apk";
const SHA256 = "c341cd382fcd89c50fc94913fdbc1b28c3763c1079b7d7466a162c9753c4a8dd";
export default function IndexPage() {
  return (<main className={styles.page}><section className={styles.card}>
    <div className={styles.badge}><Heart size={16} /> UsSpace</div>
    <h1>UsSpace v0.15.0</h1>
    <p className={styles.lead}>The latest verified Android release for Al and Yashika.</p>
    <div className={styles.status}><ShieldCheck size={22} /><div>
      <strong>Signed with the original UsSpace key</strong>
      <span>Installed, launched and checked on Android 15.</span>
    </div></div>
    <a className={styles.download} href={APK_PATH} download><Download size={20} />Download UsSpace v0.15.0 APK</a>
    <div className={styles.meta}><div><Smartphone size={18} /><span>Android APK · 8,679,473 bytes</span></div>
      <div className={styles.hash}><span>SHA-256</span><code>{SHA256}</code></div>
    </div>
    <p className={styles.note}>The next notification and Health Connect update is being tested. This link stays on the verified release until those checks pass.</p>
  </section></main>);
}
