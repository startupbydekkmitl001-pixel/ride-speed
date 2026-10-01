"""Review actual compressed output at phone size, independently of source proofs."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import json
import os
import subprocess

root = Path(__file__).resolve().parents[1]
media = root.parent / 'ExpoRideSpeed/assets/motion/v5'
manifest = json.loads((media / 'manifest.json').read_text(encoding='utf8'))
assert manifest['complete'], 'Wait for the complete verified family before encoded inspection'
output = root / 'build/inspection-encoded'
output.mkdir(parents=True, exist_ok=True)
ffmpeg = os.environ.get('FFMPEG_PATH', 'C:/ffmpeg/ffmpeg.exe' if Path('C:/ffmpeg/ffmpeg.exe').exists() else 'ffmpeg')
crops = {'garage-phone': (382, 328), 'profile-phone': (375, 490), 'hero-phone': (336, 216), 'hud-landscape': (600, 300)}
for asset_id, asset in manifest['assets'].items():
    directory = output / asset_id
    directory.mkdir(parents=True, exist_ok=True)
    frames = [0, asset['frames'] // 4, asset['frames'] // 2, asset['frames'] * 3 // 4, asset['frames'] - 1]
    selection = 'select=' + '+'.join(f'eq(n\\,{frame})' for frame in frames)
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(media / asset['video']),
                    '-vf', selection, '-fps_mode', 'vfr', '-frames:v', '5', str(directory / 'frame-%02d.png')], check=True,
                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    originals = [Image.open(directory / f'frame-{i+1:02d}.png').convert('RGB') for i in range(5)]
    originals.append(originals[0])  # Actual last-to-first seam, not an encoded duplicate endpoint.
    labels = [*frames, 'next 0']
    strip = Image.new('RGB', (960, 410), '#222222')
    draw = ImageDraw.Draw(strip)
    for i, (frame, image) in enumerate(zip(labels, originals)):
        x, y = i % 3 * 320, i // 3 * 205
        strip.paste(image.resize((320, 180), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 8, y + 184), f'{asset_id}: encoded {frame}', fill='white')
    strip.save(output / f'{asset_id}-seam.jpg', quality=95)
    for crop_name, dimensions in crops.items():
        ImageOps.fit(originals[1], dimensions, method=Image.Resampling.LANCZOS, centering=(.5, .5)).save(output / f'{asset_id}-{crop_name}.png')
for theme in ['dark', 'light']:
    items = [(key, value) for key, value in manifest['assets'].items() if value['theme'] == theme]
    board = Image.new('RGB', (1528, 353 * ((len(items) + 3) // 4)), '#222222')
    draw = ImageDraw.Draw(board)
    for i, (key, _) in enumerate(items):
        x, y = i % 4 * 382, i // 4 * 353
        board.paste(Image.open(output / f'{key}-garage-phone.png'), (x, y))
        draw.text((x + 8, y + 333), key, fill='white')
    board.save(output / f'{theme}-phone-board.jpg', quality=95)
    seams = Image.new('RGB', (1440, 205 * ((len(items) + 2) // 3)), '#222222')
    for i, (key, _) in enumerate(items):
        seams.paste(Image.open(output / f'{key}-seam.jpg').resize((480, 205), Image.Resampling.LANCZOS), (i % 3 * 480, i // 3 * 205))
    seams.save(output / f'{theme}-all-seams.jpg', quality=95)
print(f'Actual encoded crops and seams for {len(manifest["assets"])} assets: {output}')
