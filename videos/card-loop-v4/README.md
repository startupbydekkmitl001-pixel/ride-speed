# Profile material loops

Original Remotion compositions for RideSpeed's profile-card background. There is no embedded name, text, photo, logo or audio. The primary reading area is quiet, with a slow blue/sage field and a curved optical highlight near the right edge.

The pearl version uses a warm off-white substrate. The black version has an actual black reading area and a restrained graphite/blue field at the right edge. Both are 720 × 450, 30 fps, 12 seconds and exactly 360 frames.

## Rebuild

```powershell
npm ci
npm run check:loop
npm run render
python verify-pixels.py
```

The optional pixel verifier uses Pillow, NumPy and `C:/ffmpeg/ffmpeg.exe` / `ffprobe.exe`. The renderer uses installed Chrome, or the path in `RIDE_CHROME_PATH`. It uses software graphics for reproducible frame capture.

`npm run studio` previews the two compositions at port 3027 without launching a system browser. Generated renders, proofs, dependency files and bundler cache are ignored; `package-lock.json` remains tracked for reproducibility.

Native deliveries go in `ExpoRideSpeed/assets/motion/`:

- `card-loop.mp4` and `card-loop-poster.png`
- `card-loop-dark.mp4` and `card-loop-dark-poster.png`

Only render frames 0–359 into each clip. Frame 360 exists in the proof set to demonstrate exact periodicity; including it in the video would duplicate frame 0 and introduce an extra hold at the loop seam.

The supplied reference videos informed the localized light and layered material. Their pixels are not included in these files. This is pre-rendered material motion, not a live Liquid Glass shader; native identity text and controls remain separate above it.
