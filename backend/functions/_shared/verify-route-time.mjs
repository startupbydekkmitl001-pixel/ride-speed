/** Route-time consistency verification of supplied original native evidence.
 * It does not attest hardware sensors, foreground state or client clocks.
 * The old sustained_min_3s_v1 verifier intentionally remains separate. */
export class RouteTimeError extends Error {
  constructor(code){super(code);this.code=code;this.name='RouteTimeError';}
}
const fail=code=>{throw new RouteTimeError(code);};
const num=(x,lo=-Number.MAX_SAFE_INTEGER,hi=Number.MAX_SAFE_INTEGER)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi;
const integer=(x,lo=0,hi=Number.MAX_SAFE_INTEGER)=>num(x,lo,hi)&&Number.isSafeInteger(x);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keys=(x,required,optional=[])=>obj(x)&&required.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>required.includes(k)||optional.includes(k));
const RAD=Math.PI/180,A=6378137,F=1/298.257223563,E2=F*(2-F),B=A*(1-F),MARGIN=.25;
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y});
const mul=(a,t)=>({x:a.x*t,y:a.y*t});
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const length=v=>Math.hypot(v.x,v.y);
const unit=v=>mul(v,1/length(v));
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
function coordinate(p){return keys(p,['latitude','longitude'])&&num(p.latitude,-80,80)&&num(p.longitude,-180,180);}
function cartesian(p){const lat=p.latitude*RAD,lon=p.longitude*RAD,n=A/Math.sqrt(1-E2*Math.sin(lat)**2);return {x:n*Math.cos(lat)*Math.cos(lon),y:n*Math.cos(lat)*Math.sin(lon),z:n*(1-E2)*Math.sin(lat)};}
function projector(origin){const base=cartesian(origin),lat=origin.latitude*RAD,lon=origin.longitude*RAD;return p=>{const c=cartesian(p),x=c.x-base.x,y=c.y-base.y,z=c.z-base.z;return {x:-Math.sin(lon)*x+Math.cos(lon)*y,y:-Math.sin(lat)*Math.cos(lon)*x-Math.sin(lat)*Math.sin(lon)*y+Math.cos(lat)*z};};}
export function projectRaceCoordinate(origin,point){if(!coordinate(origin)||!coordinate(point))fail('APPROVAL_REVOKED');return projector(origin)(point);}
/** Bounded short-distance Vincenty inverse; never use an unconverged estimate. */
export function raceGeodesicDistance(one,two){
  if(!coordinate(one)||!coordinate(two))fail('APPROVAL_REVOKED');
  const L=(two.longitude-one.longitude)*RAD,U1=Math.atan((1-F)*Math.tan(one.latitude*RAD)),U2=Math.atan((1-F)*Math.tan(two.latitude*RAD));
  if(Math.abs(two.longitude-one.longitude)>180)fail('APPROVAL_REVOKED');
  const s1=Math.sin(U1),c1=Math.cos(U1),s2=Math.sin(U2),c2=Math.cos(U2);let lambda=L,last,sigma,sinSigma,cosSigma,cos2Alpha,cos2SigmaM;
  for(let n=0;n<32;n++){
    const sl=Math.sin(lambda),cl=Math.cos(lambda);sinSigma=Math.hypot(c2*sl,c1*s2-s1*c2*cl);if(sinSigma===0)return 0;
    cosSigma=s1*s2+c1*c2*cl;sigma=Math.atan2(sinSigma,cosSigma);const sinAlpha=c1*c2*sl/sinSigma;cos2Alpha=1-sinAlpha**2;cos2SigmaM=cos2Alpha<1e-15?0:cosSigma-2*s1*s2/cos2Alpha;
    const C=F/16*cos2Alpha*(4+F*(4-3*cos2Alpha));last=lambda;lambda=L+(1-C)*F*sinAlpha*(sigma+C*sinSigma*(cos2SigmaM+C*cosSigma*(-1+2*cos2SigmaM**2)));
    if(Math.abs(lambda-last)<=1e-12){const u2=cos2Alpha*(A*A-B*B)/(B*B),cA=1+u2/16384*(4096+u2*(-768+u2*(320-175*u2))),cB=u2/1024*(256+u2*(-128+u2*(74-47*u2)));const delta=cB*sinSigma*(cos2SigmaM+cB/4*(cosSigma*(-1+2*cos2SigmaM**2)-cB/6*cos2SigmaM*(-3+4*sinSigma**2)*(-3+4*cos2SigmaM**2)));return B*cA*(sigma-delta);}
  }
  fail('APPROVAL_REVOKED');
}
function projection(p,a,b){const v=sub(b,a),size=dot(v,v),t=size?clamp(dot(sub(p,a),v)/size,0,1):0,q=add(a,mul(v,t));return {distance:length(sub(p,q)),t,q};}
function orient(a,b,c){return cross(sub(b,a),sub(c,a));}
function intersects(a,b,c,d){const x=orient(a,b,c),y=orient(a,b,d),z=orient(c,d,a),w=orient(c,d,b);const eps=1e-7;return x*y<=eps&&z*w<=eps&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+eps&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))+eps;}
function segmentDistance(a,b,c,d){return intersects(a,b,c,d)?0:Math.min(projection(a,c,d).distance,projection(b,c,d).distance,projection(c,a,b).distance,projection(d,a,b).distance);}
function inside(p,polygon){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[j],b=polygon[i];if(projection(p,a,b).distance<1e-7)return true;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
function polygonValid(points){if(points.length<3)return false;let area=0;for(let i=0;i<points.length;i++){const j=(i+1)%points.length;area+=cross(points[i],points[j]);if(length(sub(points[i],points[j]))<.01)return false;for(let k=i+1;k<points.length;k++){const l=(k+1)%points.length;if(k===i||k===j||l===i)continue;if(intersects(points[i],points[j],points[k],points[l]))return false;}}return Math.abs(area)>1;}
function inBoundary(a,b,polygon,radius){if(!inside(a,polygon)||!inside(b,polygon))return false;for(let i=0;i<polygon.length;i++)if(segmentDistance(a,b,polygon[i],polygon[(i+1)%polygon.length])<=radius)return false;return true;}
function clipLinear(interval,value,slope,lo,hi){if(Math.abs(slope)<1e-12)return value>=lo&&value<=hi?interval:null;const x=(lo-value)/slope,y=(hi-value)/slope,L=Math.max(interval[0],Math.min(x,y)),U=Math.min(interval[1],Math.max(x,y));return L<=U?[L,U]:null;}
function circleInterval(a,v,center,radius){const q=sub(a,center),aa=dot(v,v),bb=2*dot(q,v),cc=dot(q,q)-radius**2;if(aa<1e-12)return cc<=0?[0,1]:null;const disc=bb*bb-4*aa*cc;if(disc<0)return null;const root=Math.sqrt(Math.max(0,disc)),lo=Math.max(0,(-bb-root)/(2*aa)),hi=Math.min(1,(-bb+root)/(2*aa));return lo<=hi?[lo,hi]:null;}
/** Exact union of line/capsule intersections, not endpoint containment or
 * fixed-step sampling that could miss a narrow excursion. */
function corridorContains(a,b,legs,radius){
  if(radius<=0)return false;const v=sub(b,a),intervals=[],loX=Math.min(a.x,b.x)-radius,hiX=Math.max(a.x,b.x)+radius,loY=Math.min(a.y,b.y)-radius,hiY=Math.max(a.y,b.y)+radius;
  for(const leg of legs){if(leg.maxX<loX||leg.minX>hiX||leg.maxY<loY||leg.minY>hiY)continue;const direction=leg.direction,normal=leg.normal,q=sub(a,leg.a);let rectangle=clipLinear([0,1],dot(q,direction),dot(v,direction),0,leg.length);if(rectangle)rectangle=clipLinear(rectangle,dot(q,normal),dot(v,normal),-radius,radius);if(rectangle)intervals.push(rectangle);for(const center of[leg.a,leg.b]){const interval=circleInterval(a,v,center,radius);if(interval)intervals.push(interval);}}
  intervals.sort((x,y)=>x[0]-y[0]);let covered=0;for(const [lo,hi]of intervals){if(lo>covered+1e-9)return false;covered=Math.max(covered,hi);if(covered>=1-1e-9)return true;}return false;
}
function progressAt(p,legs){const all=[];for(const leg of legs){if(p.x<leg.minX-46||p.x>leg.maxX+46||p.y<leg.minY-46||p.y>leg.maxY+46)continue;all.push({...projection(p,leg.a,leg.b),index:leg.index,start:leg.start,length:leg.length});}all.sort((a,b)=>a.distance-b.distance||a.index-b.index);const best=all[0];return best?{progress:best.start+best.t*best.length,distance:best.distance,index:best.index,candidates:all}:{progress:Infinity,distance:Infinity,index:0,candidates:[]};}
const literals={schema_version:1,method:'route_time_v1',projection:'wgs84_ecef_enu_v1',geometry_error_margin_m:.25,maximum_accuracy_m:15,maximum_gap_ms:1500,maximum_crossing_span_ms:3000,maximum_duration_ms:1800000,minimum_duration_ms:10000,maximum_acceleration_mps2:15,maximum_backtrack_m:5,whole_capture_residual_ms:250,server_time_drift_allowance_ms:250,live_start_gate_window_ms:10000};
function compile(input){
  if(!obj(input))fail('APPROVAL_REVOKED');for(const[k,value]of Object.entries(literals))if(Object.hasOwn(input,k)&&input[k]!==value)fail('APPROVAL_REVOKED');
  const allowed=['route_geometry','boundary_polygon','staging_polygon','gates','corridor_half_width_m','maximum_speed_mps','origin',...Object.keys(literals)];if(Object.keys(input).some(k=>!allowed.includes(k)))fail('APPROVAL_REVOKED');
  for(const[field,min,max]of[['route_geometry',2,512],['boundary_polygon',3,128],['staging_polygon',3,32]])if(!Array.isArray(input[field])||input[field].length<min||input[field].length>max||input[field].some(p=>!coordinate(p)))fail('APPROVAL_REVOKED');
  if(!num(input.corridor_half_width_m,10,30)||!num(input.maximum_speed_mps,.1,138.888889)||!Array.isArray(input.gates)||input.gates.length<2||input.gates.length>16)fail('APPROVAL_REVOKED');
  const origin=input.route_geometry[0],project=projector(origin),route=input.route_geometry.map(project),boundary=input.boundary_polygon.map(project),stage=input.staging_polygon.map(project),legs=[];let distance=0;
  if(Object.hasOwn(input,'origin')&&(!coordinate(input.origin)||input.origin.latitude!==origin.latitude||input.origin.longitude!==origin.longitude))fail('APPROVAL_REVOKED');
  for(const field of['route_geometry','boundary_polygon','staging_polygon'])for(const p of input[field])if(raceGeodesicDistance(origin,p)>15000)fail('APPROVAL_REVOKED');
  if(!polygonValid(boundary)||!polygonValid(stage))fail('APPROVAL_REVOKED');
  for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],size=length(sub(b,a)),geo=raceGeodesicDistance(input.route_geometry[i-1],input.route_geometry[i]);if(size<.01||Math.abs(size-geo)>MARGIN||!inBoundary(a,b,boundary,MARGIN))fail('APPROVAL_REVOKED');const direction=unit(sub(b,a));legs.push({a,b,length:size,start:distance,index:i-1,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y),direction,normal:{x:-direction.y,y:direction.x}});distance+=size;}
  if(distance<100||distance>15000)fail('APPROVAL_REVOKED');for(let i=0;i<legs.length;i++)for(let j=i+2;j<legs.length;j++)if(intersects(legs[i].a,legs[i].b,legs[j].a,legs[j].b))fail('APPROVAL_REVOKED');
  const gates=input.gates.map((g,index)=>{
    if(!keys(g,['index','kind','a','b','forward_point','progress_min_m','progress_max_m'])||g.index!==index||g.kind!==(index===0?'start':index===input.gates.length-1?'finish':'checkpoint')||![g.a,g.b,g.forward_point].every(coordinate)||!num(g.progress_min_m,0,distance)||!num(g.progress_max_m,g.progress_min_m,distance)||g.progress_min_m===g.progress_max_m)fail('APPROVAL_REVOKED');
    for(const p of[g.a,g.b,g.forward_point])if(raceGeodesicDistance(origin,p)>15000)fail('APPROVAL_REVOKED');
    const a=project(g.a),b=project(g.b),center=mul(add(a,b),.5),width=length(sub(b,a)),forward=sub(project(g.forward_point),center),normal=unit({x:-(b.y-a.y),y:b.x-a.x});if(dot(normal,forward)<0){normal.x*=-1;normal.y*=-1;}
    const match=progressAt(center,legs),leg=legs[match.index];if(width<1||width>100||length(forward)<.1||dot(normal,unit(sub(leg.b,leg.a)))<.96||match.distance>MARGIN||match.progress<g.progress_min_m||match.progress>g.progress_max_m)fail('APPROVAL_REVOKED');
    return {a,b,normal,center,width,definition:g};
  });
  for(let i=1;i<gates.length;i++)if(gates[i-1].definition.progress_max_m>=gates[i].definition.progress_min_m)fail('APPROVAL_REVOKED');
  for(let i=0;i<stage.length;i++)if(!inBoundary(stage[i],stage[(i+1)%stage.length],boundary,MARGIN)||!corridorContains(stage[i],stage[(i+1)%stage.length],legs,input.corridor_half_width_m-MARGIN)||dot(sub(stage[i],gates[0].center),gates[0].normal)>=-MARGIN)fail('APPROVAL_REVOKED');
  const configuration={...literals,origin:{...origin},route_geometry:input.route_geometry.map(p=>({...p})),boundary_polygon:input.boundary_polygon.map(p=>({...p})),staging_polygon:input.staging_polygon.map(p=>({...p})),gates:input.gates.map(g=>structuredClone(g)),corridor_half_width_m:input.corridor_half_width_m,maximum_speed_mps:input.maximum_speed_mps};
  return {configuration,project,route,boundary,stage,legs,gates,distance};
}
export function compileRaceCourse(input){return compile(input).configuration;}
function stamp(value){if(typeof value!=='string')return NaN;const match=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value);if(!match)return NaN;const parsed=Date.parse(`${match[1]}Z`);if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,19)!==match[1])return NaN;return parsed+(match[2]?Number(`0.${match[2]}`)*1000:0);}
function clockContext(evidence,context,reference){
  if(!Array.isArray(evidence.clock_probes)||evidence.clock_probes.length<3||evidence.clock_probes.length>24||!Array.isArray(evidence.arm_clock_probe_ids)||evidence.arm_clock_probe_ids.length<3||evidence.arm_clock_probe_ids.length>5||new Set(evidence.arm_clock_probe_ids).size!==evidence.arm_clock_probe_ids.length||!uuid(evidence.clock_generation))fail('EVIDENCE_CLOCK');
  if(!Array.isArray(context.attempt.arm_clock_probe_ids)||JSON.stringify(evidence.arm_clock_probe_ids)!==JSON.stringify(context.attempt.arm_clock_probe_ids)||evidence.clock_generation!==context.attempt.clock_generation)fail('EVIDENCE_CLOCK');
  const probes=new Map(),fixedServer=Array.isArray(context.clock_probes)?context.clock_probes:[];let lower=-Infinity,upper=Infinity;
  const residual=(wall,mono)=>{if(!num(wall,0)||!num(mono,0)||Math.abs((wall-reference.received_wall_ms)-(mono-reference.received_monotonic_ms))>250)fail('EVIDENCE_CLOCK');};
  for(const p of evidence.clock_probes){if(!keys(p,['probe_id','clock_generation','request_started_monotonic_ms','request_started_wall_ms','received_monotonic_ms','received_wall_ms'])||!uuid(p.probe_id)||p.clock_generation!==evidence.clock_generation||probes.has(p.probe_id))fail('EVIDENCE_CLOCK');residual(p.request_started_wall_ms,p.request_started_monotonic_ms);residual(p.received_wall_ms,p.received_monotonic_ms);if(p.received_monotonic_ms<p.request_started_monotonic_ms)fail('EVIDENCE_CLOCK');
    const stored=fixedServer.find(x=>(x.probe_id??x.id)===p.probe_id);if(!stored||stored.owner_id!==context.attempt.owner_id||stored.race_id!==evidence.race_id||stored.capture_id!==evidence.capture_id||stored.clock_generation!==evidence.clock_generation)fail('EVIDENCE_CLOCK');const sent=stamp(stored.server_sent_at),received=stamp(stored.server_received_at);if(!num(sent,0)||!num(received,0)||received>sent)fail('EVIDENCE_CLOCK');const interval={lo:sent-p.received_monotonic_ms,hi:sent-p.request_started_monotonic_ms,p};probes.set(p.probe_id,interval);
    if(evidence.arm_clock_probe_ids.includes(p.probe_id)){lower=Math.max(lower,interval.lo);upper=Math.min(upper,interval.hi);}
  }
  if(evidence.arm_clock_probe_ids.some(x=>!probes.has(x))||lower>upper)fail('EVIDENCE_CLOCK');if((upper-lower)/2>100)fail('EVIDENCE_CLOCK_PRECISION');
  const arm=evidence.lifecycle[0];for(const id of evidence.arm_clock_probe_ids){const p=probes.get(id).p;if(arm.received_monotonic_ms<p.received_monotonic_ms||arm.received_monotonic_ms-p.request_started_monotonic_ms>=5000)fail('EVIDENCE_CLOCK_STALE');}
  return {residual,fix:s=>{const age=s.received_wall_ms-s.timestamp_ms,mono=s.received_monotonic_ms-age;return {mono,lo:lower+mono-250,hi:upper+mono+250};}};
}
export function verifyRouteTime(evidence,context){
  const required=['schema_version','method','race_id','attempt_id','approval_id','config_hash','mode','schedule_epoch','common_start_at','source','platform','provider','ride_id','capture_id','first_sequence','last_sequence','capture_truncated','foreground_continuous','clock_anomaly','clock_generation','arm_clock_probe_ids','lifecycle','clock_probes','samples'];
  if(!keys(evidence,required)||evidence.schema_version!==1||evidence.method!=='route_time_v1'||!obj(context?.attempt)||!obj(context?.approval))fail('EVIDENCE_SCHEMA');
  if(evidence.source!=='ride_journal_v1'||!['ios','android'].includes(evidence.platform)||(evidence.platform==='android'?evidence.provider!=='expo_location':!['ios_core_location','expo_location'].includes(evidence.provider)))fail('EVIDENCE_SOURCE');
  if(evidence.capture_truncated!==false)fail('EVIDENCE_TRUNCATED');if(evidence.foreground_continuous!==true)fail('EVIDENCE_FOREGROUND');if(evidence.clock_anomaly!==false)fail('EVIDENCE_CLOCK');
  for(const[field,value]of[['race_id',context.attempt.race_id],['attempt_id',context.attempt.id],['approval_id',context.attempt.approval_id],['capture_id',context.attempt.capture_id],['ride_id',context.attempt.ride_id]])if(!uuid(evidence[field])||evidence[field]!==value)fail('EVIDENCE_CAPTURE');
  if(evidence.config_hash!==context.attempt.config_hash||evidence.config_hash!==context.approval.config_hash||!/^[a-f0-9]{64}$/.test(evidence.config_hash)||evidence.platform!==context.attempt.platform||evidence.provider!==context.attempt.provider||!['async','live'].includes(evidence.mode)||evidence.mode!==context.attempt.mode||evidence.schedule_epoch!==context.attempt.schedule_epoch||evidence.common_start_at!==context.attempt.common_start_at)fail('EVIDENCE_SCHEMA');
  if(!Array.isArray(evidence.samples)||evidence.samples.length<4||evidence.samples.length>8000||!integer(evidence.first_sequence,1)||!integer(evidence.last_sequence,evidence.first_sequence)||evidence.last_sequence-evidence.first_sequence+1!==evidence.samples.length)fail('EVIDENCE_CAPTURE');
  if(!Array.isArray(evidence.lifecycle)||evidence.lifecycle.length!==2||evidence.lifecycle[0]?.kind!=='armed'||evidence.lifecycle[1]?.kind!=='finish_observed')fail('EVIDENCE_FOREGROUND');
  const compiled=compile(context.approval.configuration),reference=evidence.samples[0],clock=clockContext(evidence,context,reference),sampleKeys=['sequence','received_wall_ms','received_monotonic_ms','timestamp_ms','latitude','longitude','speed_mps','horizontal_accuracy_m','speed_accuracy_mps','is_simulated_by_software','is_produced_by_accessory','mocked'];let previous=null,maxGap=0,totalDistance=0,lastProgress=-Infinity,maximumSpeed=null,unknown=false;
  const samples=evidence.samples.map((s,index)=>{
    if(!keys(s,sampleKeys)||s.sequence!==evidence.first_sequence+index)fail('EVIDENCE_CAPTURE');
    if(s.mocked===true||s.is_simulated_by_software===true)fail('EVIDENCE_MOCKED');for(const field of['mocked','is_simulated_by_software','is_produced_by_accessory']){if(s[field]!==null&&typeof s[field]!=='boolean')fail('EVIDENCE_SCHEMA');unknown||=s[field]===null;}
    if(!coordinate({latitude:s.latitude,longitude:s.longitude}))fail('EVIDENCE_SCHEMA');if(!num(s.horizontal_accuracy_m,Number.MIN_VALUE,15))fail('EVIDENCE_ACCURACY');if(!num(s.timestamp_ms,0)||!num(s.received_wall_ms,0)||!num(s.received_monotonic_ms,0))fail('EVIDENCE_TIMESTAMP');
    clock.residual(s.received_wall_ms,s.received_monotonic_ms);const age=s.received_wall_ms-s.timestamp_ms;if(age< -500||age>3000)fail('EVIDENCE_TIMESTAMP');if(s.speed_mps!==null&&!num(s.speed_mps,0,compiled.configuration.maximum_speed_mps))fail('EVIDENCE_TELEPORT');if(s.speed_accuracy_mps!==null&&!num(s.speed_accuracy_mps,0,100))fail('EVIDENCE_SCHEMA');
    const p=compiled.project(s),radius=s.horizontal_accuracy_m+MARGIN,progress=progressAt(p,compiled.legs),time=clock.fix(s);
    if(!inBoundary(p,p,compiled.boundary,radius))fail('EVIDENCE_BOUNDARY');if(!corridorContains(p,p,compiled.legs,compiled.configuration.corridor_half_width_m-radius))fail('EVIDENCE_CORRIDOR');
    const alternatives=progress.candidates.filter(x=>x.distance<=progress.distance+radius&&Math.abs(x.index-progress.index)>1);if(alternatives.length)fail('EVIDENCE_PROGRESS');if(progress.progress+5<lastProgress)fail('EVIDENCE_PROGRESS');lastProgress=Math.max(lastProgress,progress.progress);
    if(previous){const gap=s.timestamp_ms-previous.raw.timestamp_ms;if(gap<=0||s.received_monotonic_ms<previous.raw.received_monotonic_ms)fail('EVIDENCE_TIMESTAMP');if(gap>1500)fail('EVIDENCE_GAP');maxGap=Math.max(maxGap,gap);const r=Math.max(radius,previous.radius),distance=length(sub(p,previous.p)),speed=Math.max(0,distance-r-previous.radius)/(gap/1000);if(speed>compiled.configuration.maximum_speed_mps)fail('EVIDENCE_TELEPORT');if(previous.derivedSpeed!==null&&Math.abs(speed-previous.derivedSpeed)>15*(gap/1000)+2*r/(gap/1000))fail('EVIDENCE_ACCELERATION');if(!inBoundary(previous.p,p,compiled.boundary,r))fail('EVIDENCE_BOUNDARY');if(!corridorContains(previous.p,p,compiled.legs,compiled.configuration.corridor_half_width_m-r))fail('EVIDENCE_CORRIDOR');totalDistance+=distance;previous.nextSpeed=speed;}
    const out={raw:s,p,radius,progress:progress.progress,time,derivedSpeed:previous?.nextSpeed??null};previous=out;if(s.speed_mps!==null)maximumSpeed=Math.max(maximumSpeed??0,s.speed_mps);return out;
  });
  for(const event of evidence.lifecycle){if(!keys(event,['kind','received_monotonic_ms','received_wall_ms']))fail('EVIDENCE_FOREGROUND');clock.residual(event.received_wall_ms,event.received_monotonic_ms);}if(evidence.lifecycle[0].received_monotonic_ms>samples[0].raw.received_monotonic_ms||evidence.lifecycle[1].received_monotonic_ms<samples.at(-1).raw.received_monotonic_ms)fail('EVIDENCE_FOREGROUND');
  const crossings=[];let gateIndex=0,before=null,gatePrevious=null;
  for(const sample of samples){
    const prior=gatePrevious;gatePrevious=sample;
    // Every original receipt remains authoritative after a gate is completed,
    // including the tail after finish. Test the entire consecutive chord: its
    // endpoints can lie outside a finite gate while crossing inside its width.
    for(let completed=0;completed<gateIndex;completed++){
      const visited=compiled.gates[completed],side=(sample.p.x-visited.center.x)*visited.normal.x+(sample.p.y-visited.center.y)*visited.normal.y;
      if(prior){
        const priorSide=(prior.p.x-visited.center.x)*visited.normal.x+(prior.p.y-visited.center.y)*visited.normal.y;
        if(Math.abs(side)>sample.radius&&Math.abs(priorSide)>prior.radius&&priorSide*side<0){
          const intersection=add(prior.p,mul(sub(sample.p,prior.p),priorSide/(priorSide-side))),along=projection(intersection,visited.a,visited.b);
          if(along.t>0&&along.t<1)fail('EVIDENCE_GATE_DIRECTION');
        }
        const radius=Math.max(prior.radius,sample.radius);
        // Intermediate on-plane originals cannot hide a return. A chord's
        // full uncertainty tube contacting an already completed finite gate
        // cannot prove a consistent one-way visit, even without stable sides.
        if(Math.min(priorSide,side)<=radius&&Math.max(priorSide,side)>=-radius&&segmentDistance(prior.p,sample.p,visited.a,visited.b)<=radius)fail('EVIDENCE_GATE_AMBIGUOUS');
      }
      // A stable return to the finite backside also rejects a multi-fix
      // reverse visit within the5m GPS progress tolerance.
      if(side>= -sample.radius)continue;
      const along=projection(sample.p,visited.a,visited.b);
      if(along.t>0&&along.t<1&&Math.min(along.t,1-along.t)*visited.width>sample.radius)fail('EVIDENCE_GATE_DIRECTION');
    }
    if(gateIndex>=compiled.gates.length)continue;const gate=compiled.gates[gateIndex],side=dot(sub(sample.p,gate.center),gate.normal),along=projection(sample.p,gate.a,gate.b),fits=along.t>0&&along.t<1&&Math.min(along.t,1-along.t)*gate.width>sample.radius;
    if(side< -sample.radius&&fits)before=sample;
    else if(side>sample.radius&&fits){if(!before)fail('EVIDENCE_GATE_DIRECTION');if(sample.raw.timestamp_ms-before.raw.timestamp_ms>3000)fail('EVIDENCE_GATE_AMBIGUOUS');if(before.progress>gate.definition.progress_max_m||sample.progress<gate.definition.progress_min_m)fail('EVIDENCE_GATE_ORDER');crossings.push({index:gateIndex,lower_ms:before.time.lo,upper_ms:sample.time.hi,monoLower:before.time.mono,monoUpper:sample.time.mono});gateIndex++;before=null;}
  }
  if(crossings.length!==compiled.gates.length)fail('EVIDENCE_GATE_ORDER');
  const start=crossings[0],finish=crossings.at(-1),armed=stamp(context.attempt.armed_at),windowStart=stamp(context.approval.starts_at),windowEnd=stamp(context.approval.ends_at),serverNow=stamp(context.server_now);if(!num(armed,0)||!num(windowStart,0)||!num(windowEnd,0)||!num(serverNow,0)||start.lower_ms<Math.max(armed,windowStart)||finish.upper_ms>windowEnd||samples.at(-1).time.hi>serverNow+500||finish.upper_ms>serverNow+500)fail('EVIDENCE_WINDOW');
  let lower,upper;if(evidence.mode==='live'){
    const epoch=stamp(evidence.common_start_at);if(!num(epoch,0)||!uuid(evidence.schedule_epoch)||start.lower_ms<epoch||start.upper_ms>epoch+10000)fail('EVIDENCE_LATE_START');const stageSamples=samples.filter(s=>s.time.hi<=epoch);if(!stageSamples.length||stageSamples.some(s=>!inside(s.p,compiled.stage)))fail('EVIDENCE_STAGING');const prior=stageSamples.at(-1),next=samples.find(s=>s.time.lo>=epoch);if(!next||next.raw.timestamp_ms-prior.raw.timestamp_ms>1500)fail('EVIDENCE_STAGING');lower=finish.lower_ms-epoch;upper=finish.upper_ms-epoch;
  }else {lower=finish.monoLower-start.monoUpper-500;upper=finish.monoUpper-start.monoLower+500;}
  if(lower<10000||upper>1800000||totalDistance<100||totalDistance>20000)fail('EVIDENCE_DURATION');
  return {attempt_id:evidence.attempt_id,owner_id:context.attempt.owner_id,race_id:evidence.race_id,approval_id:evidence.approval_id,config_hash:evidence.config_hash,method:'route_time_v1',quality:'native_evidence_consistency',platform:evidence.platform,provenance_unknown:unknown,elapsed_lower_ms:lower,elapsed_upper_ms:upper,start_interval:{lower_ms:start.lower_ms,upper_ms:start.upper_ms},finish_interval:{lower_ms:finish.lower_ms,upper_ms:finish.upper_ms},gate_intervals:crossings.map(({index,lower_ms,upper_ms})=>({index,lower_ms,upper_ms})),distance_m:totalDistance,maximum_speed_mps:maximumSpeed,average_speed_mps:totalDistance/((lower+upper)/2000),sample_count:samples.length,max_gap_ms:maxGap};
}
export function rankElapsedIntervals(results){
  const sorted=results.map(x=>({...x})).sort((a,b)=>a.elapsed_lower_ms-b.elapsed_lower_ms||a.elapsed_upper_ms-b.elapsed_upper_ms||String(a.verified_at??'').localeCompare(String(b.verified_at??''))||a.attempt_id.localeCompare(b.attempt_id));let upper=-Infinity,rank=1;return sorted.map((row,index)=>{if(row.elapsed_lower_ms>upper){rank=index+1;upper=row.elapsed_upper_ms;}else upper=Math.max(upper,row.elapsed_upper_ms);return {...row,rank};});
}
