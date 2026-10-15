import {usspacePushService} from '../../helpers/usspacePushService';
export const flootPublic = true;
export async function handle(request: Request) {
  const result = await usspacePushService.handle(request);
  return Response.json(result.body, {status: result.status, headers: {'Cache-Control': 'no-store', ...(result.status === 503 ? {'Retry-After': '30'} : {})}});
}
