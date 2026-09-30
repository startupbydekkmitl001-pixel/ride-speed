import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { GarageScooter } from './GarageScooter.jsx';
import { FPS, LOOP_FRAMES, WIDTH, HEIGHT } from './parameters.mjs';

function Root() {
  return (
    <Composition
      id="GarageScooter"
      component={GarageScooter}
      durationInFrames={LOOP_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}
registerRoot(Root);
