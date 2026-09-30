// Conservative recomputation of caller-supplied evidence, not proof of sensor authenticity.
const WINDOW_MS = 3000;
const MAX_GAP_MS = 1500;
function fail(code) { throw new Error(code); }
const finite = value => typeof value === 'number' && Number.isFinite(value);

function inside(point, polygon) {
  let contained = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    const cross = (point.longitude-a.lng)*(b.lat-a.lat)-(point.latitude-a.lat)*(b.lng-a.lng);
    if (Math.abs(cross)<1e-10 && point.longitude>=Math.min(a.lng,b.lng) && point.longitude<=Math.max(a.lng,b.lng) && point.latitude>=Math.min(a.lat,b.lat) && point.latitude<=Math.max(a.lat,b.lat)) return true;
    if ((a.lat>point.latitude)!==(b.lat>point.latitude) && point.longitude<(b.lng-a.lng)*(point.latitude-a.lat)/(b.lat-a.lat)+a.lng) contained=!contained;
  }
  return contained;
}
function distance(a,b) {
  const rad = Math.PI/180;
  const dlat=(b.latitude-a.latitude)*rad, dlng=(b.longitude-a.longitude)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlng/2)**2;
  return 12742000*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}

export function verifyEvidence(evidence, context) {
  if (!evidence || evidence.schemaVersion!==1 || evidence.source!=='corelocation') fail('SCHEMA_UNSUPPORTED');
  if (evidence.challengeId!==context.challengeId) fail('CHALLENGE_MISMATCH');
  if (!Array.isArray(context.polygon) || context.polygon.length<3 || context.polygon.length>256 || context.polygon.some(p=>!finite(p.lat)||!finite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)) fail('COURSE_BOUNDARY_REQUIRED');
  if (![context.startsAtMs,context.endsAtMs,context.nowMs].every(finite) || context.endsAtMs<=context.startsAtMs) fail('SESSION_INVALID');
  const samples=evidence.samples;
  if (!Array.isArray(samples) || samples.length<4 || samples.length>10000) fail('SAMPLE_COUNT');
  const segments=[]; let segment=[]; let previous=null; let timestamp=-Infinity;
  for (const s of samples) {
    if (!s || !Number.isSafeInteger(s.timestampMs) || !finite(s.latitude) || !finite(s.longitude) || Math.abs(s.latitude)>90 || Math.abs(s.longitude)>180) fail('SAMPLE_MALFORMED');
    // Missing source information is unknown, never manufactured as false.
    // An accessory may be a real external GNSS source; it is not simulation.
    for (const key of ['isSimulatedBySoftware','mocked','isProducedByAccessory']) {
      if (s[key] !== undefined && s[key] !== null && typeof s[key] !== 'boolean') fail('SAMPLE_MALFORMED');
    }
    // Reject the whole submitted stream before quality/window filtering so a
    // caller cannot hide known simulated samples outside a selected window.
    if (s.isSimulatedBySoftware === true || s.mocked === true) fail('SIMULATED_LOCATION');
    if (s.timestampMs<=timestamp) fail('TIMESTAMP_ORDER');
    timestamp=s.timestampMs;
    const valid=finite(s.speedMps)&&s.speedMps>=0&&s.speedMps<=500/3.6
      &&finite(s.horizontalAccuracyM)&&s.horizontalAccuracyM>=0&&s.horizontalAccuracyM<=15
      &&finite(s.speedAccuracyMps)&&s.speedAccuracyMps>=0&&s.speedAccuracyMps<=1
      &&s.timestampMs>=context.startsAtMs&&s.timestampMs<=Math.min(context.endsAtMs,context.nowMs)&&inside(s,context.polygon);
    if (!valid) { if(segment.length)segments.push(segment);segment=[];previous=null;continue; }
    if (previous) {
      const dt=(s.timestampMs-previous.timestampMs)/1000;
      const expected=(s.speedMps+previous.speedMps)/2*dt;
      const tolerance=Math.max(10,s.horizontalAccuracyM+previous.horizontalAccuracyM+10);
      const acceleration=Math.abs(s.speedMps-previous.speedMps)/dt;
      if (dt*1000>MAX_GAP_MS || acceleration>15+(s.speedAccuracyMps+previous.speedAccuracyMps)/dt || Math.abs(distance(previous,s)-expected)>tolerance) {
        segments.push(segment); segment=[];
      }
    }
    segment.push(s); previous=s;
  }
  if(segment.length)segments.push(segment);
  let best=null;
  for(const data of segments) {
    let j=0, minHead=0, gapHead=0; const mins=[], gaps=[];
    for(let i=0;i<data.length;i++) {
      const end=data[i].timestampMs+WINDOW_MS;
      while(j<data.length&&(j===0||data[j-1].timestampMs<end)) {
        while(mins.length>minHead&&data[mins.at(-1)].speedMps>=data[j].speedMps)mins.pop();
        mins.push(j);
        if(j>0) { const gap=data[j].timestampMs-data[j-1].timestampMs;while(gaps.length>gapHead&&gaps.at(-1).gap<=gap)gaps.pop();gaps.push({index:j,gap}); }
        j++;
      }
      if(j===0||data[j-1].timestampMs<end)break;
      while(minHead<mins.length&&mins[minHead]<i)minHead++;
      while(gapHead<gaps.length&&gaps[gapHead].index<=i)gapHead++;
      if(j-i<4)continue;
      const speed=data[mins[minHead]].speedMps;
      if(!best||speed>best.speedMps)best={speedMps:speed,windowStartMs:data[i].timestampMs,windowEndMs:end,sampleCount:j-i,maximumGapSeconds:gaps[gapHead].gap/1000};
    }
  }
  if(!best)fail('NO_ELIGIBLE_WINDOW');
  return {sustainedKmh:Math.round(best.speedMps*3600)/1000,windowStartMs:best.windowStartMs,windowEndMs:best.windowEndMs,sampleCount:best.sampleCount,maximumGapSeconds:best.maximumGapSeconds,method:'sustained_min_3s_v1'};
}
