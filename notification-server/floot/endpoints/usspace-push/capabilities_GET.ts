import {usspacePushService} from '../../helpers/usspacePushService';
export const flootPublic = true;
export async function handle() {
  return Response.json(await usspacePushService.capabilities(), {headers: {'Cache-Control': 'no-store'}});
}
