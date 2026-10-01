/** Retained helper behavior after007 retires social writes,010 retires the old
 * submission-audience board read, and011 retires community writes/old feed.
 * Direct browser boundaries are tested apart.
 * Uses the existing service EXECUTE grant, with the identical Auth actor.
 * New social wrapper, direct-write denial and all RLS reads stay authenticated.
 */
export function createLegacyInternalAs(database) {
  return async function legacyInternalAs(owner, query, args=[]) {
    if(!/^(?:select public\.(?:rs_request_friend|rs_friend_action|rs_set_presence|rs_create_challenge|rs_invite_challenge|rs_challenge_action|rs_create_post|rs_publish_post|rs_delete_post|rs_report_post)\(|select \* from public\.(?:rs_leaderboard|rs_feed)\()/i.test(query))throw Error('Only retired internal helper contracts belong here');
    const db=database();await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    await db.exec('set role service_role');
    try{return await db.query(query,args);}finally{await db.exec('reset role');}
  };
}
