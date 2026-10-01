import type {Category} from '../../lib/domain';
export type Point3=readonly [number,number,number];
export type VehicleMesh={points:Point3[];faces:{indices:readonly [number,number,number];color:string}[]};
/** Original generic geometry, CC0. World: x forward, y up, z right. */
export function vehicleMesh(category:Category,paint:string):VehicleMesh{
 const mesh:VehicleMesh={points:[],faces:[]},body=/^#[\da-f]{6}$/i.test(paint)?paint:'#FF5A1F';
 function box(x:number,y:number,z:number,w:number,h:number,d:number,color:string,taper=1){
  const start=mesh.points.length;
  for(const [a,b,c] of [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]])mesh.points.push([x+a*w/2*(b>0?taper:1),y+b*h/2,z+c*d/2*(b>0?taper:1)]);
  for(const face of [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]])for(const tri of [[0,1,2],[0,2,3]])mesh.faces.push({indices:tri.map(i=>start+face[i]) as unknown as [number,number,number],color});
 }
 function wheel(x:number,z:number,r:number,width:number){
  const start=mesh.points.length,n=12;
  for(const side of [-1,1]){mesh.points.push([x,r,z+side*width/2]);for(let i=0;i<n;i++){const a=i/n*Math.PI*2;mesh.points.push([x+Math.cos(a)*r,r+Math.sin(a)*r,z+side*width/2]);}}
  for(let i=0;i<n;i++){const a=start+1+i,b=start+1+(i+1)%n,c=a+n+1,d=b+n+1;
   mesh.faces.push({indices:[start,a,b],color:'#29292D'},{indices:[start+n+1,d,c],color:'#29292D'},{indices:[a,c,b],color:'#161618'},{indices:[b,c,d],color:'#161618'});
  }
  for(const side of [-1,1]){const hub=mesh.points.length;mesh.points.push([x,r,z+side*(width/2+.002)]);for(let i=0;i<n;i++){const a=i/n*Math.PI*2;mesh.points.push([x+Math.cos(a)*r*.54,r+Math.sin(a)*r*.54,z+side*(width/2+.002)]);}for(let i=0;i<n;i++)mesh.faces.push({indices:[hub,hub+1+i,hub+1+(i+1)%n],color:'#8C8C94'});}
 }
 if(category==='car'){
  box(0,.55,0,3.5,.55,1.48,body,.93);box(-.2,1.02,0,1.95,.55,1.3,'#30363A',.74);box(-.2,1.30,0,1.40,.055,.94,body);
  for(const x of [-1.10,1.10])for(const z of [-.73,.73])wheel(x,z,.32,.20);
  for(const z of [-.50,.50]){box(1.74,.63,z,.04,.14,.34,'#FFF3D1');box(-1.73,.63,z,.04,.12,.32,'#B73630');}
 }else{
  wheel(-.97,0,.36,.20);wheel(.99,0,.36,.18);
  box(0,.47,0,1.50,.16,.35,'#28282B');box(-.44,.98,0,.92,.15,.52,'#232326',.85);
  if(category==='scooter'){box(-.57,.68,0,.82,.38,.60,body,.92);box(.60,.95,0,.32,.83,.53,body,.8);box(.65,1.45,0,.20,.17,.57,body);}
  else{box(.05,.94,0,.95,.53,.60,body,.72);box(.59,1.12,0,.50,.40,.59,body,.45);box(-.3,.57,0,.60,.46,.42,'#55555A');}
  box(.75,.70,0,.085,.89,.16,'#929298');box(.72,1.37,0,.11,.10,.85,'#8D8D94');box(.80,1.23,0,.05,.18,.27,'#FFF3D1');box(-1.00,1.00,0,.09,.10,.30,'#B73630');
 }
 return mesh;
}
/** Orthographic 3D projection, painter-sorted triangles; bounded to <500 faces. */
export function projectVehicle(mesh:VehicleMesh,yaw:number,width:number,height:number,elevation=.42){
 'worklet';
 const angle=((yaw%(2*Math.PI))+2*Math.PI)%(2*Math.PI),c=Math.cos(angle),s=Math.sin(angle),tilt=elevation,scale=Math.min(width/4.9,height/3.3);
 const points=mesh.points.map(([x,y,z])=>{const a=x*c+z*s,b=-x*s+z*c;return {x:width/2+a*scale,y:height*.68-(y*Math.cos(tilt)-b*Math.sin(tilt))*scale,depth:y*Math.sin(tilt)+b*Math.cos(tilt)};});
 const sorted=mesh.faces.map(face=>({...face,depth:face.indices.reduce((sum,i)=>sum+points[i].depth,0)/3})).sort((a,b)=>a.depth-b.depth);
 const vertices:{x:number;y:number}[]=[],colors:string[]=[];
 for(const face of sorted){
  const [a,b,d]=face.indices.map(i=>mesh.points[i]),u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[d[0]-a[0],d[1]-a[1],d[2]-a[2]],nx=u[1]*v[2]-u[2]*v[1],ny=u[2]*v[0]-u[0]*v[2],nz=u[0]*v[1]-u[1]*v[0],length=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
  const light=.66+.34*Math.abs((nx*c+nz*s)*.25/length+ny*.85/length+(-nx*s+nz*c)*.38/length);
  const shaded='#'+[1,3,5].map(i=>Math.min(255,Math.round(parseInt(face.color.slice(i,i+2),16)*light)).toString(16).padStart(2,'0')).join('');
  for(const index of face.indices){vertices.push({x:points[index].x,y:points[index].y});colors.push(shaded);}
 }
 return {vertices,colors};
}
