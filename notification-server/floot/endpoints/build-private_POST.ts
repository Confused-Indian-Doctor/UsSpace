export const flootPublic = true;
export async function handle() {
  return Response.json({error: 'endpoint-disabled'}, {status: 410, headers: {'Cache-Control': 'no-store'}});
}
