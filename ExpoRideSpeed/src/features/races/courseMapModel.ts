import type {MapCamera,MapCoordinate,MapPin,MapTrack} from '../map/MapSurface.types';
import {validateRaceCourse} from './model';
import type {RaceCourseSnapshot} from './types';
import type {RaceScreenPort,RaceTranslator} from './uiTypes';

export function authorizedRaceMember(port:RaceScreenPort):boolean{
 const race=port.race,member=race?.self_member;
 return !!(port.ownerId&&port.ready&&port.current(port.generation)&&port.gate.signedIn&&port.gate.focused&&port.gate.foreground&&port.detailFresh&&!port.detailError&&race&&race.state!=='cancelled'&&member?.user_id===port.ownerId&&member.state==='accepted'&&member.evidence_consent_version===1&&member.consented_at);
}
/** A trimmed invitation is never a source for the private course. */
export function authorizedRaceCourse(port:RaceScreenPort):Readonly<{key:string;course:RaceCourseSnapshot}>|null{
 if(!authorizedRaceMember(port)||port.courseError)return null;
 const race=port.race!,course=port.course;
 if(!course||course.race_id!==race.id||course.approval_id!==race.approval.id||course.config_hash!==race.approval.config_hash||course.route_geometry_hash!==race.approval.route_geometry_hash)return null;
 return {key:[port.ownerId,port.generation,race.id,race.self_member.member_generation,course.approval_id,course.config_hash,course.route_geometry_hash].join(':'),course};
}
export type RaceCourseMapGeometry=Readonly<{track:MapTrack;pins:readonly MapPin[];coordinates:readonly MapCoordinate[];camera:MapCamera;gates:readonly {id:string;kind:'start'|'checkpoint'|'finish';number:number;directionDegrees:number}[]}>;
export function raceCourseMapGeometry(input:RaceCourseSnapshot,t:RaceTranslator):RaceCourseMapGeometry{
 const course=validateRaceCourse(input,input.race_id),config=course.configuration;
 const gates=config.gates.map(gate=>{
  const center={latitude:(gate.a.latitude+gate.b.latitude)/2,longitude:(gate.a.longitude+gate.b.longitude)/2};
  const east=(gate.forward_point.longitude-center.longitude)*Math.cos(center.latitude*Math.PI/180),north=gate.forward_point.latitude-center.latitude;
  return {id:`course-gate-${gate.index}`,kind:gate.kind,number:gate.index+1,center,directionDegrees:Math.round((Math.atan2(east,north)*180/Math.PI+360)%360)%360};
 });
 const segments=[config.route_geometry,...config.gates.map(gate=>[gate.a,gate.b]),[...config.staging_polygon,config.staging_polygon[0]]];
 const pins=gates.map(gate=>({id:gate.id,coordinate:gate.center,label:t(`m5c.gate${gate.kind==='start'?'Start':gate.kind==='finish'?'Finish':'Checkpoint'}`,{number:gate.number}),role:gate.kind==='start'?'start' as const:gate.kind==='finish'?'finish' as const:'via' as const,order:gate.number}));
 return {track:{kind:'recorded',segments},pins,coordinates:[...segments.flat(),...config.gates.map(gate=>gate.forward_point)],camera:{center:config.route_geometry[0],zoom:12,bearing:0,pitch:0},gates};
}
