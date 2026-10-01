import {deflateSync} from 'node:zlib';
// Deterministic raster export of our original mesh; no downloaded image input.
function crc(bytes){let n=0xffffffff;for(const byte of bytes){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;}
function chunk(type,data){const tag=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,checksum]);}
export function vehiclePng(frame,size=128){
 const rgba=Buffer.alloc(size*size*4),vertices=frame.vertices.map(p=>({x:p.y+(size/2-size*.57),y:size-p.x}));
 const edge=(a,b,x,y)=>(x-a.x)*(b.y-a.y)-(y-a.y)*(b.x-a.x);
 for(let i=0;i<vertices.length;i+=3){const [a,b,c]=vertices.slice(i,i+3),area=edge(a,b,c.x,c.y);if(Math.abs(area)<.0001)continue;const color=[1,3,5].map(j=>parseInt(frame.colors[i].slice(j,j+2),16));
  for(let y=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y)));y<=Math.min(size-1,Math.ceil(Math.max(a.y,b.y,c.y)));y++)for(let x=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x)));x<=Math.min(size-1,Math.ceil(Math.max(a.x,b.x,c.x)));x++){
   const values=[edge(a,b,x+.5,y+.5),edge(b,c,x+.5,y+.5),edge(c,a,x+.5,y+.5)];if(!values.every(v=>area>0?v>=0:v<=0))continue;const at=(y*size+x)*4;rgba[at]=color[0];rgba[at+1]=color[1];rgba[at+2]=color[2];rgba[at+3]=255;
  }
 }
 const rows=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)rgba.copy(rows,y*(size*4+1)+1,y*size*4,(y+1)*size*4);
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
