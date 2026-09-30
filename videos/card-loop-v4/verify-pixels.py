"""Inspect generated assets only; requires local FFmpeg, Pillow and NumPy."""
from pathlib import Path
import json
import subprocess
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
FFMPEG = Path('C:/ffmpeg/ffmpeg.exe')
FFPROBE = Path('C:/ffmpeg/ffprobe.exe')

def rms(a, b):
    return float(np.sqrt(np.mean((a.astype(np.float64)-b.astype(np.float64))**2)))

def proof(name, frame):
    return np.array(Image.open(ROOT/'proofs'/f'{name}-{frame}.png').convert('RGB'))

reports = []
for name in ['card-loop', 'card-loop-dark']:
    video = ROOT/'renders'/f'{name}.mp4'
    meta = json.loads(subprocess.check_output([str(FFPROBE), '-v','error','-show_streams','-show_format','-of','json',str(video)]))
    streams = meta['streams']
    assert len(streams) == 1 and streams[0]['codec_type'] == 'video', 'No audio or extra stream should be present'
    info = streams[0]
    assert (info['width'], info['height'], info['r_frame_rate'], int(info['nb_frames'])) == (720,450,'30/1',360)
    assert abs(float(meta['format']['duration'])-12) < .0001
    assert video.stat().st_size < 2_000_000
    first, second, last, endpoint = [proof(name, f) for f in [0,1,359,360]]
    assert np.array_equal(first, endpoint), 'Virtual endpoint pixels differ from first frame'
    boundary = rms(last, first)
    adjacent = rms(first, second)
    assert boundary < 1, 'A visible discontinuity is likely at the boundary'
    assert boundary <= adjacent * 1.35 + .03, 'Boundary transition is much larger than ordinary motion'

    # Read every encoded frame to validate the actual video and compare its loop
    # boundary with the distribution of ordinary adjacent-frame changes.
    process = subprocess.Popen([str(FFMPEG),'-v','error','-i',str(video),'-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    encoded_first = None
    previous = None
    deltas = []
    count = 0
    frame_bytes = 720*450*3
    while True:
        data = process.stdout.read(frame_bytes)
        if not data:
            break
        assert len(data) == frame_bytes, 'Incomplete decoded frame'
        current = np.frombuffer(data,dtype=np.uint8).reshape((450,720,3)).copy()
        if encoded_first is None:
            encoded_first = current
        if previous is not None:
            deltas.append(rms(previous,current))
        previous = current
        count += 1
    stderr = process.stderr.read().decode()
    assert process.wait() == 0 and not stderr, stderr
    assert count == 360
    encoded_boundary = rms(previous,encoded_first)
    # Compression creates a slightly different I-frame error pattern at frame 0.
    # Permit at most one 8-bit level RMS and compare against normal steps.
    assert encoded_boundary < 1
    assert encoded_boundary <= max(deltas)*1.5 + .1
    report = {
        'file':name+'.mp4','bytes':video.stat().st_size,'width':720,'height':450,
        'durationSeconds':12,'fps':30,'frames':count,'audioStreams':0,
        'virtualEndpointPixelsIdentical':True,
        'rawBoundaryRms':boundary,'rawFirstAdjacentRms':adjacent,
        'encodedBoundaryRms':encoded_boundary,
        'encodedAdjacentRmsMedian':float(np.median(deltas)),
        'encodedAdjacentRmsMax':float(max(deltas)),
        'blackReadingZoneMaxRgb':int(encoded_first[:,:200,:].max()) if name.endswith('dark') else None,
    }
    reports.append(report)

(ROOT/'validation.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf-8')
print(json.dumps(reports,indent=2))
