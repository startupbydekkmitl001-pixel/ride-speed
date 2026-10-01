import React from 'react';
import { Composition, Folder, registerRoot } from 'remotion';
import { GarageScooter } from './GarageScooter.jsx';
import { FPS, LOOP_FRAMES, WIDTH, HEIGHT } from './parameters.mjs';
import { assets, THEMES } from './catalog.mjs';
import { MaterialLoop } from './MaterialLoop.jsx';

function Root() {
  return (
    <>
    {THEMES.map(theme => <Folder key={theme} name={theme}>
      {assets.filter(asset => asset.theme === theme).map(asset => <Composition
        key={asset.id} id={asset.composition} component={MaterialLoop}
        durationInFrames={asset.frames} fps={asset.fps} width={asset.width} height={asset.height}
        defaultProps={{ assetId: asset.id }}
      />)}
    </Folder>)}
    <Composition
      id="GarageScooter"
      component={GarageScooter}
      durationInFrames={LOOP_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    </>
  );
}
registerRoot(Root);
