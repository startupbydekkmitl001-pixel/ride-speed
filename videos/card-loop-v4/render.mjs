import {bundle} from '@remotion/bundler';
import {selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {LOOP_FRAMES} from './src/motion.mjs';

const browserExecutable=process.env.RIDE_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chromiumOptions={gl:'swangle'};
fs.mkdirSync('renders',{recursive:true});
fs.mkdirSync('proofs',{recursive:true});
const serveUrl=await bundle({entryPoint:path.resolve('src/index.jsx'),outDir:path.resolve('build/remotion')});
for(const [id,name] of [['PearlCard','card-loop'],['BlackCard','card-loop-dark']]) {
  const config={serveUrl,id,browserExecutable,chromiumOptions};
  const composition=await selectComposition(config);
  // Frame 360 is a virtual endpoint for comparison only, never encoded.
  const proofComposition={...composition,durationInFrames:LOOP_FRAMES+1};
  for(const frame of [0,1,90,180,270,359,360]) {
    await renderStill({...config,composition:proofComposition,frame,output:path.resolve(`proofs/${name}-${frame}.png`)});
  }
  let last=-1;
  await renderMedia({...config,composition,codec:'h264',crf:19,pixelFormat:'yuv420p',concurrency:4,outputLocation:path.resolve(`renders/${name}.mp4`),onProgress:({progress})=>{const p=Math.floor(progress*4)*25;if(p!==last){last=p;console.log(`${name}: ${p}%`);}}});
  console.log(`Rendered ${name}.mp4`);
}
