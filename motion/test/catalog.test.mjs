import test from 'node:test';
import assert from 'node:assert/strict';
import { assets, assetById, PALETTES, materialAtFrame, materialVelocityAtFrame } from '../src/catalog.mjs';

test('all 14 requested roles have one explicit dark and light asset with bounded offline footprint', () => {
  assert.equal(assets.length, 28);
  assert.equal(new Set(assets.map(asset => asset.id)).size, 28);
  const grouped = Map.groupBy(assets, asset => asset.role);
  assert.equal(grouped.size, 14);
  for (const variants of grouped.values()) assert.deepEqual(variants.map(asset => asset.theme), ['dark', 'light']);
  for (const asset of assets) {
    assert.equal(asset.frames, asset.seconds * 60);
    assert.ok([6, 8].includes(asset.seconds));
    assert.equal(asset.width, 1280); assert.equal(asset.height, 720);
    assert.ok(asset.targetBytes <= asset.maximumVideoBytes);
    const [x, y, width, height] = asset.safeZone;
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= asset.width && y + height <= asset.height);
  }
  assert.ok(assets.reduce((sum, asset) => sum + asset.targetBytes + 20000, 0) < 20000000);
  assert.equal(assetById('garage-scooter'), assetById('garage-scooter-dark'));
  assert.throws(() => assetById('made-up-vehicle'));
});

test('every material is position and velocity continuous at the seam, without an endpoint hold', () => {
  for (const asset of assets) {
    assert.deepEqual(materialAtFrame(asset, 0), materialAtFrame(asset, asset.frames));
    assert.deepEqual(materialVelocityAtFrame(asset, 0), materialVelocityAtFrame(asset, asset.frames));
    assert.deepEqual(materialAtFrame(asset, -1), materialAtFrame(asset, asset.frames - 1));
    assert.notDeepEqual(materialAtFrame(asset, 0), materialAtFrame(asset, 1));
    assert.notDeepEqual(materialAtFrame(asset, asset.frames - 1), materialAtFrame(asset, asset.frames));
    // Actual numeric derivative must converge to the analytic seam derivative.
    const epsilon = 0.001, left = materialAtFrame(asset, -epsilon), right = materialAtFrame(asset, epsilon);
    const analytic = materialVelocityAtFrame(asset, 0);
    for (const key of Object.keys(analytic)) assert.ok(Math.abs((right[key] - left[key]) / (2 * epsilon) - analytic[key]) < 0.000001, `${asset.id}/${key}`);
  }
});

test('decorative chromatic palette is a single warm accent and the gauge has a tiny opacity swing', () => {
  assert.equal(PALETTES.dark.background, '#000000');
  assert.equal(PALETTES.light.background, '#FAFAF8');
  for (const palette of Object.values(PALETTES)) {
    assert.equal(palette.accent, '#FF5A1F');
    for (const [key, hex] of Object.entries(palette)) {
      if (key === 'accent' || key === 'background') continue;
      const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
      assert.ok(Math.max(...channels) - Math.min(...channels) <= 2, `Neutral app token: ${hex}`);
    }
  }
  const gauge = assetById('speedometer-glow-dark');
  const values = Array.from({ length: gauge.frames }, (_, frame) => materialAtFrame(gauge, frame).glow);
  assert.ok(Math.max(...values) - Math.min(...values) <= 0.02);
});
