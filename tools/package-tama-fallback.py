"""Build the compatible 320x420 atlas and panel portraits from Tama's HD packs."""
import json
from pathlib import Path
import sys
from PIL import Image

name = sys.argv[1] if len(sys.argv) > 1 else 'tama'
if name not in ('tama', 'pudding'):
    raise SystemExit('Supported characters: tama, pudding')
out=Path(__file__).resolve().parents[1]/'assets/characters'/name
manifest=json.loads((out/'full-hd/manifest.json').read_text(encoding='utf-8'))
variant=next(v for v in manifest['variants'] if v['frameWidth']==320)
layer=variant['layers'][0]
states=['idle','thinking','attention','success','error','sleep']
atlas=Image.new('RGBA',(1280,2520))
for row,state in enumerate(states):
    sequence=layer['tracks'][state]
    for col in range(4):
        f=layer['frames'][sequence[col%len(sequence)]]
        with Image.open(out/'full-hd'/variant['pages'][f['page']]['file']) as page:
            frame=page.crop((f['x'],f['y'],f['x']+320,f['y']+420))
            atlas.alpha_composite(frame,(col*320,row*420))
atlas.save(out/'atlas.webp',lossless=True,method=6)
for state in ['portrait','thinking','attention','success','error','sleep']:
    image=Image.open(out/'bust-hd'/f'{state}.png').convert('RGBA')
    image.thumbnail((256,256),Image.Resampling.LANCZOS)
    image.save(out/f'{state}.png')
print(f'{name}: 24 fallback slots; six original state portraits')
