// @ts-nocheck
// Generated from functions/src/delivery-retry.mjs; do not edit policy here.

export const usspacePushRetry = (() => {
/* Only explicit FCM rejection codes may be retried. Unknown transport outcomes stay
 * at-most-once. The caller rechecks private account/preferences before every send. */
const MESSAGING_TRANSIENT = new Set(['messaging/server-unavailable', 'messaging/internal-error',
  'messaging/quota-exceeded', 'messaging/message-rate-exceeded', 'messaging/device-message-rate-exceeded']);
const DATABASE_TRANSIENT = new Set([4, 8, 10, 13, 14, '4', '8', '10', '13', '14',
  'deadline-exceeded', 'resource-exhausted', 'aborted', 'internal', 'unavailable']);
const messagingRetryable = error => MESSAGING_TRANSIENT.has(error?.code);
const databaseRetryable = error => DATABASE_TRANSIENT.has(error?.code);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function retryDelay(attempt, quota = false) {
  return Math.min(quota ? 60000 : 30000, (quota ? 10000 : 1000) * 2 ** Math.min(Math.max(attempt - 1, 0), 8));
}
async function retryDatabase(operation, {sleep = delay, attempts = 4, stopped = () => false, onRetry = () => {}} = {}) {
  for (let attempt = 1; ; attempt++) {
    if (stopped()) return undefined;
    try {return await operation();} catch (error) {
      if (!databaseRetryable(error) || attempt >= attempts) throw error;
      onRetry(attempt);
      await sleep(retryDelay(attempt));
    }
  }
}

return {messagingRetryable, databaseRetryable, delay, retryDelay, retryDatabase};
})();
