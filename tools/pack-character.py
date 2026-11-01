"""Resolution-aware packer for registered transparent source frames/layers.

python tools/pack-character.py spec.json --out assets/characters/NAME/sprites
python tools/pack-character.py --legacy assets/characters/NAME/atlas.webp --out ...
New artwork must be registered at native 320:420 aspect, no automatic upscaling.
"""
import argparse
import json
import math
from pathlib import Path
from PIL import Image

RESOLUTIONS = (320, 640, 960)
MAX_GROUP_BYTES = 32 * 1024 * 1024
STATES = ('idle', 'thinking', 'attention', 'success', 'error', 'sleep')


def load_spec(path):
    spec = json.loads(path.read_text(encoding='utf-8'))
    assert 1 <= len(spec['layers']) <= 12, '1–12 layers per character'
    sources = []
    ids = set()
    for layer in spec['layers']:
        assert layer['id'] not in ids and (not layer.get('parent') or layer['parent'] in ids), 'Parents precede children'
        ids.add(layer['id'])
        assert 1 <= len(layer['files']) <= 256, 'Frame budget exceeded'
        frames = [Image.open(path.parent / f).convert('RGBA') for f in layer['files']]
        assert len({p.size for p in frames}) == 1, 'Register each layer on one fixed canvas'
        assert all(p.width * 420 == p.height * 320 for p in frames), 'Expected 320:420 aspect ratio'
        assert all(p.getchannel('A').getextrema()[0] == 0 for p in frames), 'Transparent source required'
        for sequence in layer.get('tracks', {}).values():
            assert sequence and all(isinstance(i, int) and 0 <= i < len(frames) for i in sequence), 'Invalid track frame'
        sources.append((layer, frames))
    return spec, sources


def legacy_sources(path):
    image = Image.open(path).convert('RGBA')
    assert image.size == (1280, 2520), 'Legacy fallback must be 4x6 at 320x420'
    frames = [image.crop((c*320, r*420, (c+1)*320, (r+1)*420)) for r in range(6) for c in range(4)]
    tracks = {s: list(range(r*4, r*4+4)) for r, s in enumerate(STATES)}
    tracks.update(idle=[0,0,0,0,0,0,1,2,2,2,2,2,3,0], blink=[0,1,0], wave=[2,3,2,3])
    return {'rigged': False, 'sourceDetail': 'legacy; native authored detail not increased'}, [({'id': 'body', 'role': 'composite', 'tracks': tracks}, frames)]


def pack(spec, sources, out, resolutions=(320,), max_texture=2048):
    assert max_texture >= 512 and max_texture <= 8192
    assert resolutions and all(w in RESOLUTIONS for w in resolutions)
    # Check everything before writing anything, including all requested tiers.
    for width in resolutions:
        assert all(frames[0].width >= width for _, frames in sources), f'{width} requested but native source is smaller; regeneration required'
        height = width * 420 // 320
        assert width+4 <= max_texture and height+4 <= max_texture, 'Frame cannot fit texture limit'
        assert (width+4)*(height+4)*4*len(sources) <= MAX_GROUP_BYTES, 'Too many layers for this tier; merge static layers'
    out.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 2, 'logicalSize': [320, 420], 'rigged': bool(spec.get('rigged')), 'sourceDetail': spec.get('sourceDetail', 'native registered source frames'), 'variants': []}
    for width in sorted(set(resolutions)):
        height = width * 420 // 320
        # Budget per page includes worst case of one distinct page per layer.
        max_page_bytes = MAX_GROUP_BYTES // len(sources)
        cols = min(4, max_texture // (width+4))
        while cols*(width+4)*(height+4)*4 > max_page_bytes:
            cols -= 1
        rows = min(max_texture // (height+4), max_page_bytes // (cols*(width+4)*(height+4)*4))
        capacity = cols*rows
        variant = {'frameWidth': width, 'frameHeight': height, 'pages': [], 'layers': []}
        for layer, frames in sources:
            result = {k: v for k, v in layer.items() if k not in ('files', 'frames', 'anchors')}
            result['frames'] = []
            for start in range(0, len(frames), capacity):
                count = min(capacity, len(frames)-start)
                page_cols = min(cols, count)
                page_rows = math.ceil(count/page_cols)
                page = Image.new('RGBA', (page_cols*(width+4), page_rows*(height+4)))
                page_id = len(variant['pages'])
                for slot in range(count):
                    original = frames[start+slot]
                    # Pillow's premultiplied-alpha resize avoids dark RGB fringes.
                    resized = original.convert('RGBa').resize((width, height), Image.Resampling.LANCZOS).convert('RGBA')
                    x, y = slot % page_cols*(width+4)+2, slot//page_cols*(height+4)+2
                    page.alpha_composite(resized, (x, y))
                    rect = {'page': page_id, 'x': x, 'y': y}
                    if layer.get('anchors'):
                        assert len(layer['anchors']) == len(frames)
                        rect['anchor'] = layer['anchors'][start+slot]
                    result['frames'].append(rect)
                name = f'{width}-{len(variant["pages"]):03d}.webp'
                page.save(out/name, lossless=True, method=6)
                variant['pages'].append({'file': name, 'width': page.width, 'height': page.height})
            variant['layers'].append(result)
        manifest['variants'].append(variant)
    # Native standalone expressions never depend on a large animation atlas.
    for name, path in spec.get('expressions', {}).items():
        assert name in ('portrait', *STATES), 'Unknown expression name'
        expression = Image.open(path).convert('RGBA')
        expression.thumbnail((960, 1260), Image.Resampling.LANCZOS)
        expression.save(out/(name+'.png'))
    (out/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    return manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('spec', type=Path, nargs='?')
    parser.add_argument('--legacy', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--resolutions', default='320', help='320,640,960 (native sources required)')
    parser.add_argument('--max-texture', type=int, default=2048)
    args=parser.parse_args()
    spec,sources=legacy_sources(args.legacy) if args.legacy else load_spec(args.spec)
    if args.spec:
        spec['expressions']={key:str(args.spec.parent/value) for key,value in spec.get('expressions',{}).items()}
    result=pack(spec,sources,args.out,tuple(map(int,args.resolutions.split(','))),args.max_texture)
    print(json.dumps({'variants':[(v['frameWidth'],v['frameHeight'],len(v['pages'])) for v in result['variants']], 'sourceDetail':result['sourceDetail']}))


if __name__ == '__main__':
    main()
