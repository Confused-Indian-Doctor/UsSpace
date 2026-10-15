import {usspaceTravelService} from '../../helpers/usspaceTravelService';
export const flootPublic=true;
export async function handle(request:Request){const result=await usspaceTravelService.handle(request,'route');return Response.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store'}});}
