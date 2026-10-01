"""Generated media only: cover crops, quarter-cycle filmstrips and theme boards."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import json

root = Path(__file__).resolve().parents[1]
manifest_path = root.parent / 'ExpoRideSpeed/assets/motion/v5/manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf8'))
output = root / 'build/inspection'
output.mkdir(parents=True, exist_ok=True)
crops = {'garage-phone': (382, 328), 'profile-phone': (375, 490), 'hero-phone': (336, 216), 'hud-landscape': (600, 300)}
for asset_id, asset in manifest['assets'].items():
    frames = [0, asset['frames'] // 4, asset['frames'] // 2, asset['frames'] * 3 // 4, asset['frames'] - 1, asset['frames']]
    originals = [Image.open(root / 'build/proofs' / asset_id / f'frame-{frame}.png').convert('RGB') for frame in frames]
    # Inspection labels are outside images and never baked into delivered material.
    strip = Image.new('RGB', (320 * 3, 205 * 2), '#222222')
    draw = ImageDraw.Draw(strip)
    for i, (frame, image) in enumerate(zip(frames, originals)):
        x, y = (i % 3) * 320, (i // 3) * 205
        strip.paste(image.resize((320, 180), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 8, y + 184), f'{asset_id}: frame {frame}', fill='white')
    strip.save(output / f'{asset_id}-seam.jpg', quality=94)
    for crop_name, dimensions in crops.items():
        quarter = ImageOps.fit(originals[1], dimensions, method=Image.Resampling.LANCZOS, centering=(.5, .5))
        quarter.save(output / f'{asset_id}-{crop_name}.png')

for theme in ['dark', 'light']:
    items = [(key, value) for key, value in manifest['assets'].items() if value['theme'] == theme]
    if not items:
        continue
    board = Image.new('RGB', (382 * 4, 353 * ((len(items) + 3) // 4)), '#222222')
    draw = ImageDraw.Draw(board)
    for i, (key, _) in enumerate(items):
        x, y = i % 4 * 382, i // 4 * 353
        board.paste(Image.open(output / f'{key}-garage-phone.png'), (x, y))
        draw.text((x + 8, y + 333), key, fill='white')
    board.save(output / f'{theme}-phone-board.jpg', quality=95)
print(f'Inspected {len(manifest["assets"])} assets: {output}')
