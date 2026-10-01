import type { Coordinate } from './types';
export type RouteCategory = 'scooter'|'motorcycle'|'car'|'bicycle';
export type RouteVisibility = 'private'|'friends'|'public';
export type RouteStopV1 = Readonly<{lat:number;lng:number;label:string;place_id?:string}>;
export type RouteDocumentV1 = Readonly<{
 schema_version:1;title:string;category:RouteCategory;visibility:RouteVisibility;
 stops:readonly RouteStopV1[];
 source:Readonly<{kind:'road';routeToken:string}|{kind:'recorded';segments:readonly string[]}|{kind:'draft'}>;
}>;
export type RouteSyncDraft = Readonly<{operationId:string;routeId:string;expectedRevision:number;document:RouteDocumentV1}>;
export type RouteDeleteDraft = Readonly<{operationId:string;routeId:string;expectedRevision:number}>;
export type RouteSyncAck = Readonly<{
 operation_id:string;route_id:string;action:'save'|'delete';applied_revision:number;
 current_revision:number|null;document_sha256:string|null;synced_at:string;
}>;
export type RouteSnapshot = Readonly<{
 id:string;owner_id:string;revision:number;document:RouteDocumentV1;
 segments:readonly (readonly Coordinate[])[];distanceMeters:number|null;durationSeconds:number|null;
 geometryHash:string|null;provider:'geoapify'|'recorded'|'draft';calculatedAt:string|null;
 attribution:string|null;updated_at:string;
}>;
export type RouteCursor = Readonly<{updated_at:string;id:string}>;
export type RoutePage = Readonly<{items:readonly RouteSnapshot[];next_cursor:RouteCursor|null}>;
export type RouteProjection = Readonly<{
 id:string;owner_id:string;revision:number;title:string;category:RouteCategory;visibility:RouteVisibility;
 segments:readonly (readonly Coordinate[])[];geometryStatus:'trimmed'|'hidden';privacyTrimMeters:200;
 geometryHash:string|null;provider:'geoapify'|'recorded'|'draft';attribution:string|null;
}>;
