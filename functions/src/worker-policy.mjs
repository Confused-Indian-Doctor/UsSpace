// Worker startup is a baseline, not a replay of historical personal data.
export function timestampVersion(timestamp) {
  if (!timestamp || !Number.isInteger(timestamp.seconds) || !Number.isInteger(timestamp.nanoseconds)) return '';
  return `${timestamp.seconds}:${String(timestamp.nanoseconds).padStart(9, '0')}`;
}
function compare(a, b) {
  const parse = value => {const match = /^(\d+):(\d{9})$/.exec(value || ''); return match ? BigInt(match[1]) * 1000000000n + BigInt(match[2]) : -1n;};
  return parse(a) - parse(b);
}
export function workerDecision({initial, previousVersion, version, now = Date.now()}) {
  if (!/^\d+:\d{9}$/.test(version || '')) return 'drop';
  if (previousVersion && compare(version, previousVersion) <= 0n) return 'drop';
  if (initial) return 'baseline';
  const milliseconds = Number(version.split(':')[0]) * 1000 + Number(version.split(':')[1]) / 1000000;
  // An expired/offline backlog must not startle the recipient with old updates.
  if (milliseconds < now - 15 * 60 * 1000 || milliseconds > now + 5 * 60 * 1000) return 'baseline';
  return 'deliver';
}
