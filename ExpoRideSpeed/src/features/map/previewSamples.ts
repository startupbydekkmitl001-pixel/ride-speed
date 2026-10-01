import type {MapPeer} from './MapSurface.types';
/** Synthetic display fixture. Must never enter a recorder, publisher or verifier. */
export function previewSamples(sequence:number,step:number,now:number,names:readonly string[]):MapPeer[]{
 return names.map((name,index)=>{
  const phase=(step+index*14)%80,segment=Math.floor(phase/20),progress=(phase%20)/20;
  const corners=[[100.5378,13.7450],[100.5420,13.7450],[100.5420,13.7480],[100.5378,13.7480]];
  const a=corners[segment],b=corners[(segment+1)%4],longitude=a[0]+(b[0]-a[0])*progress,latitude=a[1]+(b[1]-a[1])*progress;
  const id=`local-preview-${index}`,stamp=new Date(1_790_000_000_000+sequence*1000).toISOString();
  return {id,name,presence:'riding',coordinate:{latitude,longitude},updatedAtMs:1_790_000_000_000+sequence*1000,
   sample:{topicGeneration:1,expiresMonotonicMs:now+2500,position:{user_id:id,display_name:name,latitude,longitude,accuracy_m:5,heading_deg:[90,0,270,180][segment],captured_at:stamp,received_at:stamp,expires_at:new Date(1_790_000_005_000+sequence*1000).toISOString(),member_generation:1,consent_revision:1,sequence,authority:'unverified_live'}}};
 });
}
