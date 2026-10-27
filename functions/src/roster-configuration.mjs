/* Admin-run setup only. No route exposes these configuration operations. */
import {createHash,randomBytes} from 'node:crypto';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function resolveRosterOwner({db,auth,ownerEmail}){
 if(typeof ownerEmail!=='string'||ownerEmail.length>254||!/^\S+@\S+\.\S+$/.test(ownerEmail))throw Error('invalid-owner-email');
 const user=await auth.getUserByEmail(ownerEmail);if(!id(user.uid)||user.disabled||user.emailVerified!==true)throw Error('existing-verified-owner-required');
 const account=await db.doc('users/'+user.uid).get(),pair=account.data()?.coupleId;if(!account.exists||!id(pair))throw Error('existing-pair-required');
 const roles=await db.doc('couples/'+pair+'/usRoles/identity').get(),r=roles.data();if(!roles.exists||r?.alUid!==user.uid||!id(r?.yashikaUid)||r.yashikaUid===user.uid)throw Error('canonical-owner-role-required');
 const [own,peer,peerAccount,room]=await Promise.all([db.doc('couples/'+pair+'/members/'+user.uid).get(),db.doc('couples/'+pair+'/members/'+r.yashikaUid).get(),db.doc('users/'+r.yashikaUid).get(),db.doc('couples/'+pair).get()]);
 if(!own.exists||!peer.exists||!peerAccount.exists||peerAccount.data()?.coupleId!==pair||!room.exists||room.data()?.memberCount!==2)throw Error('current-paired-members-required');
 return {ownerUid:user.uid,pairId:pair,partnerUid:r.yashikaUid};
}
export async function installRosterBinding({db,roster,ownerUid,pairId,now=()=>Date.now(),tokenFactory=()=>randomBytes(32).toString('base64url')}){
 if(!id(ownerUid)||!id(pairId))throw Error('invalid-owner');
 const ref=db.doc('jubileeBindings/current'),previous=await ref.get();
 // Never rotate or re-enable a disabled/current connection as a setup side effect.
 if(previous.exists)throw Error('binding-already-exists-review-required');
 const exportToken=tokenFactory();if(!/^[A-Za-z0-9_-]{43}$/.test(exportToken))throw Error('invalid-generated-token');
 const issued=await roster.issue(ownerUid,'jubilee');
 try{await db.runTransaction(async tx=>{if((await tx.get(ref)).exists)throw Error('binding-already-exists-review-required');tx.set(ref,{ownerUid,pairId,enabled:true,exportToken,ingressCredential:issued.credential,ingressCredentialId:issued.id,createdAt:new Date(now()).toISOString(),credentialExpiresAt:now()+issued.expiresInDays*86400000});});}
 catch(error){await roster.revoke(ownerUid,issued.id).catch(()=>{});throw error;}
 // Only the one-way public verifier leaves this process. Never return bearer values.
 return {configured:true,exportTokenSha256:hash(exportToken),credentialExpiresInDays:issued.expiresInDays};
}
