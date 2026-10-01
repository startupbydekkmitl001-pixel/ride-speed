# Original generic vehicle meshes

These scooter, sport motorcycle and car meshes were authored procedurally for
Ride Speed. They contain no downloaded vehicle assets, manufacturer badges or
third-party textures. They are deliberately generic category illustrations, not
PCX160, S1000RR or Civic RS replicas.

The original mesh data in `src/features/map/vehicleMesh.ts` and its generated glTF
files in this directory are dedicated to the public domain under **CC0-1.0**:
https://creativecommons.org/publicdomain/zero/1.0/ . No attribution is required.

Rebuild from the ExpoRideSpeed directory:

```sh
node scripts/export-vehicle-models.mjs
```

`manifest.json` records exact sizes and triangle counts. Native preview projects
the same geometry through Skia Vertices with Reanimated/Gesture Handler on the UI
thread. Web uses a canvas that redraws only on direct interaction or resize.
Neither plays a 360-degree video or claims a map-space model layer.
The active garage vehicle is the persisted selection; peer vehicle propagation
is not present in the existing v1 shared-position protocol.

The stage reuses the existing category's muted Remotion loop via AmbientLoop,
including the central two-player budget, poster fallback and offscreen policy.
Its 1280×720 60 fps H.264 exports and re-render commands remain in `/motion/README.md`.
