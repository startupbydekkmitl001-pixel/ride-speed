import type {Session} from '@supabase/supabase-js';
import {isAccountCurrent,type AuthScope} from '../../state/AuthState';
import {getRouteOwner,getRouteProjection} from '../routes/syncService';
import {sharePreview} from '../routes/compatibilityModel';
import type {RouteProjection} from '../routes/syncTypes';
import {getInvitationRoutePage,type InvitationRoute,type InvitationRouteCursor} from '../social/invitationReviewService';
export type ConvoyRouteReview=Readonly<{route:InvitationRoute;shared:RouteProjection}>;
function fence(scope:AuthScope,session:Session){if(!scope.userId||!isAccountCurrent(scope)||session.user.id!==scope.userId)throw Error('ACCOUNT_CHANGED');}
/** The existing owner metadata keyset preserves reachability beyond 30 routes. */
export const getConvoyRoutePage=getInvitationRoutePage;
export type ConvoyRouteCursor=InvitationRouteCursor;
export async function reviewConvoyRoute(scope:AuthScope,session:Session,route:InvitationRoute):Promise<ConvoyRouteReview>{
 fence(scope,session);if(route.owner_id!==scope.userId)throw Error('CONVOY_CHANGED');
 const [owner,shared]=await Promise.all([getRouteOwner(scope,session,route.id),getRouteProjection(scope,session,route.id)]);fence(scope,session);
 if(!owner||!shared||owner.revision!==route.revision||owner.document.title!==route.title||owner.document.category!==route.category||shared.revision!==route.revision)throw Error('CONVOY_CHANGED');
 sharePreview(owner,shared);return {route,shared};
}
