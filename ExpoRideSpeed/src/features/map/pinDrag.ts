import type { MapCoordinate, MapPin, MapSurfaceProps } from './MapSurface.types';
type DragState = { alive:boolean; ready:boolean; epoch:number; mode:MapSurfaceProps['mode']; selectedPinId:string|null; pins:readonly MapPin[] };
export type PinDragTicket = { id:string; epoch:number; origin:MapCoordinate };
const valid = (value:MapCoordinate) => Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude)<=90 && Math.abs(value.longitude)<=180;
export function startPinDrag(state:DragState,expectedId:string|null=state.selectedPinId):PinDragTicket|null {
  if(state.selectedPinId!==expectedId)return null;
  const pin=state.pins.find(value=>value.id===state.selectedPinId);
  return state.alive && state.ready && state.mode==='edit' && pin && valid(pin.coordinate) ? {id:pin.id,epoch:state.epoch,origin:{...pin.coordinate}} : null;
}
export function finishPinDrag(ticket:PinDragTicket|null,state:DragState,coordinate:MapCoordinate):{id:string;coordinate:MapCoordinate}|null {
  if(!ticket || !valid(coordinate) || !state.alive || !state.ready || state.mode!=='edit' || state.epoch!==ticket.epoch || state.selectedPinId!==ticket.id)return null;
  const current=state.pins.find(pin=>pin.id===ticket.id);
  if(!current || current.coordinate.latitude!==ticket.origin.latitude || current.coordinate.longitude!==ticket.origin.longitude)return null;
  return {id:ticket.id,coordinate:{...coordinate}};
}
