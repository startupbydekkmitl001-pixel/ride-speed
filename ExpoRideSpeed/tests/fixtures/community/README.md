These JPEGs contain original synthetic pixels and no user or reference assets.

- `prepared-gradient.jpg`: 1600×1200 RGB gradient encoded by Pillow 12.2.0 at JPEG quality 86, 65,596 bytes. Used as the exact output-byte fixture for lifecycle, digest, dimensions and ownership tests.
- `small-prepared.jpg`: 32×24 solid accent colour, 645 bytes, JPEG quality 86. Suitable for bounded encoding/validator edge fixtures.

The preparation test runs the actual TypeScript pipeline with mocked native/web SDK I/O and real JPEG bytes. It does not establish native encoder behavior, orientation, memory or frame-rate performance. Actual iPhone/Android ImageManipulator output must pass the deployed canonical JPEG verifier before image validation is claimed.

The larger fixture also passed the current backend strict decoded-pixel verifier locally on 2026-10-01; this proves fixture compatibility, not hosted CPU quota or native encoding acceptance. A copy is available in the ignored `build/review-v5/m7/prepared-gradient-candidate.jpg` for the backend author's bounded validation work.
