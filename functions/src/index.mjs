import {initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {setGlobalOptions} from 'firebase-functions/v2';
import {logger} from 'firebase-functions';
import {makeDispatcher} from './dispatch.mjs';

initializeApp();
setGlobalOptions({region: 'us-central1', maxInstances: 10, memory: '256MiB', timeoutSeconds: 60});
const dispatcher = makeDispatcher({db: getFirestore(), messaging: getMessaging(), logger, serverTimestamp: () => FieldValue.serverTimestamp()});
const handler = kind => async event => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after) return; // Deleted documents contain no shareable notification.
  return dispatcher.deliver({kind, coupleId: event.params.coupleId, itemId: event.params.itemId || 'common',
    eventId: event.id, before, after});
};
const watched = (path, kind) => onDocumentWritten({document: path, retry: true}, handler(kind));
// Only existing shared changes and strict, authenticated document writes can send.
// No HTTP/callable endpoint accepts recipient UIDs, FCM tokens or message contents.
export const notifyCommon = watched('couples/{coupleId}/shared/common', 'common');
export const notifyStatus = watched('couples/{coupleId}/profiles/{itemId}', 'profile');
export const notifyAppreciation = watched('couples/{coupleId}/usJar/{itemId}', 'jar');
export const notifyReleasedLetter = watched('couples/{coupleId}/usLetters/{itemId}', 'letter');
export const notifyBucket = watched('couples/{coupleId}/usBucket/{itemId}', 'bucket');
export const notifyPing = watched('couples/{coupleId}/usPings/{itemId}', 'ping');
export const notifySharedWorkTime = watched('couples/{coupleId}/workSummaries/{itemId}', 'work');
