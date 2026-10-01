import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { assetById, materialAtFrame, PALETTES } from './catalog.mjs';

/** All paths are original mathematical/vector work; they depict material only. */
function contours(shape) {
  switch (shape) {
    case 'sleeve': return { edge: 'M908 -90 C1060 124 893 300 1002 486 C1070 610 1040 730 1190 815', fill: 'L1450 815 L1450 -100 Z', light: [972, 350], radius: [245, 330] };
    case 'chamfer': return { edge: 'M1044 -100 L884 184 Q864 218 872 248 L970 608 Q978 640 1056 812', fill: 'L1440 812 L1440 -100 Z', light: [939, 366], radius: [190, 245] };
    case 'auth-sleeve': return { edge: 'M1046 -80 C902 94 1033 277 936 424 C864 534 1003 672 1090 800', fill: 'L1450 800 L1450 -100 Z', light: [959, 430], radius: [230, 330] };
    case 'license': return { edge: 'M773 -100 C971 88 737 233 820 393 C903 551 763 664 925 800', fill: 'L1450 800 L1450 -100 Z', light: [812, 360], radius: [178, 282] };
    case 'roof': return { edge: 'M-120 642 C177 552 414 602 672 539 C922 479 1170 546 1400 493', fill: 'L1400 900 L-120 900 Z', light: [850, 560], radius: [430, 145] };
    case 'plate-first': return { edge: 'M-60 671 L282 671 Q310 671 310 643 L310 515 Q310 487 338 487 L476 487 L476 438 Q476 410 504 410 L790 410 Q818 410 818 438 L818 487 L970 487 Q998 487 998 515 L998 643 Q998 671 1026 671 L1360 671', fill: 'L1360 850 L-60 850 Z', light: [680, 475], radius: [320, 170] };
    case 'plate-second': return { edge: 'M-60 686 L320 686 Q346 686 346 660 L346 553 Q346 527 372 527 L502 527 L502 470 Q502 444 528 444 L758 444 Q784 444 784 470 L784 527 L914 527 Q940 527 940 553 L940 660 Q940 686 966 686 L1360 686', fill: 'L1360 850 L-60 850 Z', light: [685, 509], radius: [280, 142] };
    case 'plate-third': return { edge: 'M-60 696 L352 696 Q376 696 376 672 L376 586 Q376 562 400 562 L518 562 L518 495 Q518 471 542 471 L742 471 Q766 471 766 495 L766 562 L884 562 Q908 562 908 586 L908 672 Q908 696 932 696 L1360 696', fill: 'L1360 850 L-60 850 Z', light: [680, 533], radius: [250, 122] };
    case 'horizon': return { edge: 'M-120 624 C302 624 408 567 670 569 C923 571 1070 624 1410 624', fill: 'L1410 850 L-120 850 Z', light: [726, 592], radius: [390, 105] };
    case 'bands': return { edge: 'M-120 610 C330 610 449 566 671 566 C927 566 1090 610 1410 610', secondary: 'M-120 650 C330 650 449 606 671 606 C927 606 1090 650 1410 650', fill: 'L1410 850 L-120 850 Z', light: [726, 610], radius: [375, 100] };
    case 'contour': return { edge: 'M-120 641 C207 641 413 575 668 583 C923 591 1164 643 1410 629', secondary: 'M-120 668 C207 668 413 602 668 610 C923 618 1164 670 1410 656', fill: 'L1410 850 L-120 850 Z', light: [726, 621], radius: [455, 95] };
    case 'parallel': return { edge: 'M920 -80 C833 123 903 291 862 432 C828 549 895 668 948 800', secondary: 'M1082 -80 C995 123 1065 291 1024 432 C990 549 1057 668 1110 800', fill: 'L1440 800 L1440 -80 Z', light: [972, 396], radius: [240, 295] };
    case 'annulus': return { edge: 'M1006 431 A92 92 0 1 1 874 552', light: [942, 504], radius: [155, 155] };
    case 'gauge': return { edge: 'M264 746 C298 598 462 499 642 499 C822 499 986 598 1020 746', fill: 'L1020 880 L264 880 Z', light: [642, 639], radius: [350, 192] };
    default: throw new Error(`Unknown shape ${shape}`);
  }
}

export function MaterialLoop({ assetId }) {
  const frame = useCurrentFrame();
  const asset = assetById(assetId), palette = PALETTES[asset.theme];
  const state = materialAtFrame(asset, frame), contour = contours(asset.shape);
  const dark = asset.theme === 'dark';
  const [lightX, lightY] = contour.light;
  const [radiusX, radiusY] = contour.radius;
  const [zoneX, zoneY, zoneWidth, zoneHeight] = asset.safeZone;
  const rankStrength = asset.shape === 'plate-second' ? 0.7 : asset.shape === 'plate-third' ? 0.5 : 1;
  return (
    <AbsoluteFill style={{ backgroundColor: palette.background }}>
      <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="paint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={palette.background} />
            <stop offset=".3" stopColor={palette.substrate} />
            <stop offset=".6" stopColor={palette.raised} />
            <stop offset="1" stopColor={palette.background} />
          </linearGradient>
          <radialGradient id="warm">
            <stop offset="0" stopColor={palette.accent} stopOpacity=".72" />
            <stop offset=".28" stopColor={palette.accent} stopOpacity=".26" />
            <stop offset=".7" stopColor={palette.accent} stopOpacity=".035" />
            <stop offset="1" stopColor={palette.accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="shine">
            <stop offset="0" stopColor={palette.reflection} stopOpacity={dark ? '.65' : '1'} />
            <stop offset=".27" stopColor={palette.reflection} stopOpacity={dark ? '.21' : '.8'} />
            <stop offset="1" stopColor={palette.reflection} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={palette.hairline} stopOpacity="0" />
            <stop offset=".38" stopColor={palette.accent} stopOpacity={dark ? '.78' : '.65'} />
            <stop offset=".65" stopColor={palette.hairline} stopOpacity={dark ? '.31' : '.16'} />
            <stop offset="1" stopColor={palette.hairline} stopOpacity="0" />
          </linearGradient>
          <filter id="soft" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="10" /></filter>
          <clipPath id="panel">{contour.fill ? <path d={`${contour.edge} ${contour.fill}`} /> : <rect width="1280" height="720" />}</clipPath>
        </defs>
        <rect width="1280" height="720" fill={palette.background} />
        <g transform={`rotate(${state.lean} 980 360)`}>
          {contour.fill && <path d={`${contour.edge} ${contour.fill}`} fill="url(#paint)" opacity={dark ? '.76' : '.94'} />}
          <g clipPath="url(#panel)">
            <ellipse cx={lightX + state.offsetX} cy={lightY + state.offsetY} rx={radiusX} ry={radiusY} fill="url(#warm)" opacity={state.glow * rankStrength * (dark ? 1 : .6)} />
            <ellipse cx={lightX + 86 - state.offsetX * .5} cy={lightY - 64 + state.offsetY * .45} rx={radiusX * .8} ry={radiusY * .52} fill="url(#shine)" opacity={state.reflection * (dark ? 1 : 3)} />
          </g>
          <path d={contour.edge} fill="none" stroke={palette.accent} strokeWidth={asset.shape === 'gauge' ? 6 : 7} opacity={state.glow * rankStrength * (dark ? .45 : .2)} filter="url(#soft)" />
          <path d={contour.edge} fill="none" stroke="url(#edge)" strokeWidth={asset.shape === 'annulus' ? 1.4 : 1.1} opacity={state.edge * rankStrength} />
          {contour.secondary && <path d={contour.secondary} fill="none" stroke="url(#edge)" strokeWidth=".8" opacity={state.edge * .42} />}
          {asset.shape === 'annulus' && <ellipse cx={lightX + state.offsetX} cy={lightY + state.offsetY} rx="25" ry="25" fill="url(#warm)" opacity={state.glow * .3} />}
        </g>
        {/* Reading zone is genuinely opaque/static, not a transparency estimate. */}
        <rect x={zoneX} y={zoneY} width={zoneWidth} height={zoneHeight} fill={palette.background} />
      </svg>
    </AbsoluteFill>
  );
}
