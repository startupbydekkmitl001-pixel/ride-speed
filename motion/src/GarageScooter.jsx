import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { materialAtFrame } from './parameters.mjs';

// Original abstract painted-metal material. No photos, marks, labels, or reference assets.
export function GarageScooter() {
  const p = materialAtFrame(useCurrentFrame());
  const edge = 'M 904 -100 C 1086 120 908 292 1020 494 C 1114 669 1274 691 1390 810';
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', overflow: 'hidden' }}>
      <svg width="1280" height="720" viewBox="0 0 1280 720" aria-hidden="true">
        <defs>
          <linearGradient id="paint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000000" />
            <stop offset="0.34" stopColor="#080808" />
            <stop offset="0.63" stopColor="#101010" />
            <stop offset="1" stopColor="#030303" />
          </linearGradient>
          <radialGradient id="amber" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#FF5A1F" stopOpacity="0.78" />
            <stop offset="0.25" stopColor="#FF5A1F" stopOpacity="0.30" />
            <stop offset="0.64" stopColor="#FF5A1F" stopOpacity="0.05" />
            <stop offset="1" stopColor="#FF5A1F" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="reflection" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.15" />
            <stop offset="0.30" stopColor="#FFFFFF" stopOpacity="0.045" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF5A1F" stopOpacity="0" />
            <stop offset="0.20" stopColor="#FF5A1F" stopOpacity="0.20" />
            <stop offset="0.52" stopColor="#FF5A1F" stopOpacity="0.70" />
            <stop offset="0.82" stopColor="#FF5A1F" stopOpacity="0.10" />
            <stop offset="1" stopColor="#FF5A1F" stopOpacity="0" />
          </linearGradient>
          <filter id="soft" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
          <clipPath id="panel">
            <path d={`${edge} L 1500 820 L 1500 -100 Z`} />
          </clipPath>
          <linearGradient id="reading-zone">
            <stop offset="0" stopColor="#000000" />
            <stop offset="0.72" stopColor="#000000" />
            <stop offset="1" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g transform={`rotate(${p.lean} 1110 360)`}>
          <path d={`${edge} L 1500 820 L 1500 -100 Z`} fill="url(#paint)" />
          <ellipse cx={p.rimX} cy={p.rimY} rx="232" ry="188" fill="url(#amber)" opacity={p.glowOpacity} />
          <g clipPath="url(#panel)">
            <ellipse cx={p.lightX} cy={p.lightY} rx="270" ry="230" fill="url(#reflection)" />
          </g>
          <path d={edge} fill="none" stroke="url(#edge)" strokeWidth="16" opacity="0.27" filter="url(#soft)" />
          <path d={edge} fill="none" stroke="url(#edge)" strokeWidth="2.2" opacity={p.edgeOpacity} />
        </g>
        {/* The title/photo zone stays true-black while the material moves at the right edge. */}
        <rect width="830" height="720" fill="url(#reading-zone)" />
      </svg>
    </AbsoluteFill>
  );
}
