import {usspaceRosterService} from '../../helpers/usspaceRosterService';
export const flootPublic=true;
export async function handle(request:Request){const result=await usspaceRosterService.handle(request,'import');return Response.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store'}});}
