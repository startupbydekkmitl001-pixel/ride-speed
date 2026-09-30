import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {materialAtFrame} from './motion.mjs';

export function CardMaterial({dark = false}) {
  const frame = useCurrentFrame();
  const m = materialAtFrame(frame);
  const base = dark ? '#000000' : '#eeefe8';
  const lens = `M ${538+m.lensTilt} -50 C ${624+m.lensBend} 46, ${460+m.lensBend} 157, ${609+m.lensTilt} 276 S ${779+m.lensBend} 408, 729 510`;
  const secondLens = `M ${617+m.lensBend} -55 C ${545+m.lensTilt} 99, ${724+m.lensTilt} 172, ${647+m.lensBend} 323 S 715 456, 769 510`;

  return <AbsoluteFill style={{backgroundColor:base,overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,background:dark?'linear-gradient(90deg,#000 44%,#020507 76%,#050b0f)':'linear-gradient(110deg,#f6f6ef,#edeee5 57%,#e1e7e4)'}}/>
    <div style={{position:'absolute',left:m.blueX-245,top:m.blueY-238,width:490,height:476,borderRadius:'50%',opacity:m.blueOpacity,background:dark?'radial-gradient(ellipse,#294e69 0%,#163648 31%,#07172190 58%,transparent 74%)':'radial-gradient(ellipse,#99c4df 0%,#b9d4e0 30%,#dce6e999 58%,transparent 74%)',filter:'blur(21px)'}}/>
    <div style={{position:'absolute',left:m.sageX-262,top:m.sageY-166,width:524,height:332,borderRadius:'50%',opacity:m.sageOpacity,background:dark?'radial-gradient(ellipse,#284c42 0%,#132e2880 44%,transparent 72%)':'radial-gradient(ellipse,#becdb1 0%,#d6dfcba6 40%,transparent 74%)',filter:'blur(20px)'}}/>
    <div style={{position:'absolute',left:m.lightX-173,top:m.lightY-139,width:346,height:278,borderRadius:'50%',opacity:dark?.30:.75,background:dark?'radial-gradient(ellipse,#97bab5 0%,#526f783a 45%,transparent 68%)':'radial-gradient(ellipse,#fffff4 0%,#fbfbf096 42%,transparent 68%)',filter:'blur(19px)'}}/>
    <svg width="720" height="450" viewBox="0 0 720 450" style={{position:'absolute',inset:0}}>
      <defs>
        <linearGradient id="ridge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={dark?'#a5c2cc':'#ffffff'} stopOpacity=".2"/><stop offset=".3" stopColor={dark?'#839da8':'#ffffff'} stopOpacity=".9"/><stop offset=".65" stopColor={dark?'#486b6c':'#f8fff5'} stopOpacity=".2"/><stop offset="1" stopColor={dark?'#8cafab':'#ffffff'} stopOpacity=".6"/></linearGradient>
        <filter id="softRidge" x="-100%" y="-30%" width="300%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
        <filter id="thinRidge" x="-100%" y="-30%" width="300%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>
      </defs>
      <path d={lens} fill="none" stroke={dark?'#284c65':'#83b6d1'} strokeWidth="38" opacity={dark?.18:.18} filter="url(#softRidge)"/>
      <path d={lens} fill="none" stroke="url(#ridge)" strokeWidth="7" opacity={m.highlightOpacity*(dark?.22:1)} filter="url(#thinRidge)"/>
      <path d={secondLens} fill="none" stroke={dark?'#638e82':'#f8fff3'} strokeWidth="16" opacity={dark?.08:.26} filter="url(#softRidge)"/>
    </svg>
    {/* Preserve a stable reading zone; the right edge carries the material motion. */}
    <div style={{position:'absolute',inset:0,background:dark?'linear-gradient(90deg,#000 0%,#000 34%,#000000f5 47%,#00000072 67%,transparent 84%)':'linear-gradient(90deg,#f6f6ef 0%,#f6f6effc 25%,#f0f1e8ed 44%,#ebeee594 63%,transparent 85%)'}}/>
    <div style={{position:'absolute',inset:0,background:dark?'linear-gradient(180deg,#00000055,transparent 30%,transparent 70%,#00000077)':'linear-gradient(180deg,#fffffa38,transparent 30%,transparent 70%,#dfe4d81c)'}}/>
  </AbsoluteFill>;
}
