import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {CardMaterial} from './CardMaterial';
import {FPS,LOOP_FRAMES,SIZE} from './motion.mjs';
const Root = () => <>
  <Composition id="PearlCard" component={CardMaterial} durationInFrames={LOOP_FRAMES} fps={FPS} {...SIZE} defaultProps={{dark:false}}/>
  <Composition id="BlackCard" component={CardMaterial} durationInFrames={LOOP_FRAMES} fps={FPS} {...SIZE} defaultProps={{dark:true}}/>
</>;
registerRoot(Root);
