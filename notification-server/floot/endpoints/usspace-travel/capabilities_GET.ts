import {usspaceTravelService} from '../../helpers/usspaceTravelService';
export const flootPublic=true;
export async function handle(){return Response.json(await usspaceTravelService.capabilities(),{headers:{'Cache-Control':'no-store'}});}
