import type { RideSummaryV1 } from '../rides/syncTypes';
import type { RouteLocalRecord } from './localModel';
import { decodeRoutePolyline } from './syncModel';
import type { BuilderDraft } from './types';

export function builderFromRecord(record:RouteLocalRecord):BuilderDraft {
 const {document,geometry}=record;
 return {title:document.title,category:document.category,visibility:document.visibility,
  stops:document.stops.map((stop,index)=>({id:`${record.localId}:${index}`,label:stop.label,coordinate:{latitude:stop.lat,longitude:stop.lng},...(stop.place_id?{placeId:stop.place_id}:{})})),
  geometry:geometry&&document.source.kind!=='draft'&&!record.sync.blocked?{
   kind:document.source.kind,segments:geometry.segments,distanceMeters:geometry.distanceMeters,durationSeconds:geometry.durationSeconds,
   calculatedAt:geometry.calculatedAt,
   ...(geometry.attribution?{attribution:geometry.attribution}:{}),
   ...(document.source.kind==='road'?{routeToken:document.source.routeToken}:{recordedParts:[...document.source.segments]}),
  }:null};
}
/** Compressed recording parts keep pauses/gaps. No ETA or road snap is invented. */
export function builderFromRide(summary:RideSummaryV1,title:string,startLabel:string,finishLabel:string):BuilderDraft {
 const fragments=summary.geometry.fragments;
 if(fragments.length<1||fragments.length>32)throw Error('ROUTE_TOO_LARGE');
 const segments=fragments.map(fragment=>decodeRoutePolyline(fragment.polyline));
 const points=segments.flat();if(points.length<2||points.length>10000)throw Error('ROUTE_TOO_LARGE');
 const category=summary.vehicle?.category??'scooter';
 return {title,category,visibility:'private',stops:[{id:'record-start',label:startLabel,coordinate:{...points[0]}},{id:'record-finish',label:finishLabel,coordinate:{...points.at(-1)!}}],
  geometry:{kind:'recorded',segments,distanceMeters:summary.distance_m,durationSeconds:null,recordedParts:fragments.map(fragment=>fragment.polyline)}};
}
