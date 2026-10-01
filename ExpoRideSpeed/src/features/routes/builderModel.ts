import type { MapCoordinate } from '../map/MapSurface.types';
import type { BuilderDraft, BuilderStop, RoadResult, RouteCategory, RouteDocument } from './types';
export type BuilderHistory = { value:BuilderDraft; history:BuilderDraft[] };
const valid=(value:MapCoordinate)=>Number.isFinite(value.latitude)&&Number.isFinite(value.longitude)&&Math.abs(value.latitude)<=90&&Math.abs(value.longitude)<=180;
export function blankBuilder(category:RouteCategory):BuilderHistory { return {value:{title:'',category,visibility:'private',stops:[],geometry:null},history:[]}; }
function mutate(state:BuilderHistory,stops:BuilderStop[]):BuilderHistory {
  return {value:{...state.value,stops,geometry:null},history:[...state.history.slice(-29),{...state.value,stops:state.value.stops.map(stop=>({...stop,coordinate:{...stop.coordinate}})),geometry:null}]};
}
export function addBuilderStop(state:BuilderHistory,stop:BuilderStop):BuilderHistory {
  if(state.value.stops.length>=12 || !stop.id || state.value.stops.some(value=>value.id===stop.id) || !valid(stop.coordinate))return state;
  return mutate(state,[...state.value.stops,{...stop,coordinate:{...stop.coordinate}}]);
}
export function moveBuilderPin(state:BuilderHistory,id:string,coordinate:MapCoordinate):BuilderHistory {
  const target=state.value.stops.find(value=>value.id===id);
  if(!target || !valid(coordinate) || coordinate.latitude===target.coordinate.latitude&&coordinate.longitude===target.coordinate.longitude)return state;
  return mutate(state,state.value.stops.map(value=>value.id===id?{...value,coordinate:{...coordinate},placeId:undefined}:value));
}
export function removeBuilderStop(state:BuilderHistory,id:string):BuilderHistory {
  return state.value.stops.some(value=>value.id===id)?mutate(state,state.value.stops.filter(value=>value.id!==id)):state;
}
export function reverseBuilderStops(state:BuilderHistory):BuilderHistory { return state.value.stops.length>1?mutate(state,[...state.value.stops].reverse()):state; }
export function reorderBuilderStop(state:BuilderHistory,id:string,delta:number):BuilderHistory {
  const index=state.value.stops.findIndex(value=>value.id===id), target=index+delta;
  if(index<0 || target<0 || target>=state.value.stops.length)return state;
  const stops=[...state.value.stops]; [stops[index],stops[target]]=[stops[target],stops[index]]; return mutate(state,stops);
}
export function roundTripBuilder(state:BuilderHistory,id:string):BuilderHistory {
  if(state.value.stops.length<2||state.value.stops.length>=12)return state;
  return addBuilderStop(state,{...state.value.stops[0],id,coordinate:{...state.value.stops[0].coordinate}});
}
export function undoBuilder(state:BuilderHistory):BuilderHistory {
  const value=state.history.at(-1); return value?{value:{...state.value,stops:value.stops.map(stop=>({...stop,coordinate:{...stop.coordinate}})),geometry:null},history:state.history.slice(0,-1)}:state;
}
export const routingProfile=(category:RouteCategory)=>category==='scooter'?'scooter':category==='motorcycle'?'motorcycle':'drive';
function builderSource(value:BuilderDraft):RouteDocument['source']|null {
  const geometry=value.geometry;
  return geometry?.kind==='road'&&geometry.routeToken?{kind:'road',routeToken:geometry.routeToken}:geometry?.kind==='recorded'&&geometry.recordedParts?.length?{kind:'recorded',segments:[...geometry.recordedParts]}:null;
}
/** Cached geometry is a preview; saving requires current owner proof or the recording parts. */
export const builderHasSaveSource=(value:BuilderDraft):boolean=>builderSource(value)!==null;
export const needsRoadCalculation=(value:BuilderDraft):boolean=>value.stops.length>=2&&value.category!=='bicycle'&&value.geometry?.kind!=='recorded'&&!builderHasSaveSource(value);
export function routeInputKey(value:BuilderDraft):string { return JSON.stringify([value.category,value.stops.map(stop=>[stop.id,stop.coordinate.latitude,stop.coordinate.longitude])]); }
export function applyRoadResult(state:BuilderHistory,key:string,result:RoadResult):BuilderHistory {
  if(routeInputKey(state.value)!==key || result.profile!==routingProfile(state.value.category))return state;
  return {...state,value:{...state.value,geometry:{kind:'road',segments:result.segments.map(part=>part.map(point=>({...point}))),distanceMeters:result.distanceMeters,durationSeconds:result.durationSeconds,routeToken:result.routeToken,requestHash:result.requestHash,attribution:result.attribution,calculatedAt:result.calculatedAt}}};
}
export function builderDocument(value:BuilderDraft):RouteDocument {
  const title=value.title.trim();
  if(!title || Array.from(title).length>80 || /[\u0000-\u001f\u007f]/.test(title))throw new Error('ROUTE_INVALID_TITLE');
  if(value.stops.length<2 || value.stops.length>12 || value.stops.some(stop=>!valid(stop.coordinate)||!stop.label.trim()||Array.from(stop.label).length>80))throw new Error('ROUTE_INVALID_STOPS');
  const source=builderSource(value);
  if(!source)throw new Error('ROUTE_NOT_READY');
  return {schema_version:1,title,category:value.category,visibility:value.visibility,stops:value.stops.map(stop=>({lat:stop.coordinate.latitude,lng:stop.coordinate.longitude,label:stop.label.trim(),...(stop.placeId?{place_id:stop.placeId}:{})})),source};
}
export class RequestGate {
  private sequence=0;
  begin(key:string,ownerGeneration:number){return {sequence:++this.sequence,key,ownerGeneration};}
  invalidate(){++this.sequence;}
  accepts(ticket:{sequence:number;key:string;ownerGeneration:number},key:string,ownerGeneration:number){return ticket.sequence===this.sequence&&ticket.key===key&&ticket.ownerGeneration===ownerGeneration;}
}
