/** Retained helper behavior tests after007 retires superseded browser writes.
 * Uses the existing service EXECUTE grant, with the identical Auth actor.
 * New social wrapper, direct-write denial and all RLS reads stay authenticated.
 */
export function createLegacyInternalAs(database) {
  return async function legacyInternalAs(owner, query, args=[]) {
    if(!/^select public\.(?:rs_request_friend|rs_friend_action|rs_set_presence|rs_create_challenge|rs_invite_challenge|rs_challenge_action)\(/i.test(query))throw Error('Only retired internal mutation helpers belong here');
    const db=database();await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    await db.exec('set role service_role');
    try{return await db.query(query,args);}finally{await db.exec('reset role');}
  };
}
