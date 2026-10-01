import type { Session } from '@supabase/supabase-js';
import { accountClient, isAccountCurrent, type AuthScope } from '../../state/AuthState';
import { parseRoadResult, parseSearchResult, roadRequest, safeProviderCode, searchRequest } from './providerModel';
import type { Coordinate, RoadResult, RoutingProfile, SearchResult } from './types';
function ensure(scope:AuthScope,session:Session|null):asserts session is Session {
  if(!isAccountCurrent(scope))throw new Error('ACCOUNT_CHANGED');
  if(!scope.userId||!session)throw new Error('AUTH_REQUIRED');
  if(session.user.id!==scope.userId)throw new Error('ACCOUNT_CHANGED');
}
async function invoke(scope:AuthScope,session:Session|null,body:ReturnType<typeof searchRequest>|ReturnType<typeof roadRequest>,signal?:AbortSignal):Promise<unknown>{
  ensure(scope,session);
  const {data,error}=await accountClient(scope,session).functions.invoke('route-service',{body,signal,timeout:12000});
  ensure(scope,session);
  if(error){
    let code='PROVIDER_UNAVAILABLE';
    if('context' in error && error.context instanceof Response){
      try{const value=await error.context.json();code=safeProviderCode(value?.error);}catch{/* Never expose a provider response body. */}
    }
    ensure(scope,session);throw new Error(code);
  }
  return data;
}
/** Consent belongs to the caller's explicit confirmation. These functions never run on launch. */
export async function searchPlaces(scope:AuthScope,session:Session|null,query:string,language:'th'|'en',consent:boolean,proximity?:Coordinate,signal?:AbortSignal):Promise<SearchResult>{
  return parseSearchResult(await invoke(scope,session,searchRequest(query,language,consent,proximity),signal));
}
export async function calculateRoad(scope:AuthScope,session:Session|null,stops:readonly Coordinate[],profile:RoutingProfile,consent:boolean,signal?:AbortSignal):Promise<RoadResult>{
  return parseRoadResult(await invoke(scope,session,roadRequest(stops,profile,consent),signal),profile);
}
