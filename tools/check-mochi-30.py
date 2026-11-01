"""Check actual packed pixels, not only declared frame dimensions."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
for view in ['full','bust']:
    directory=ROOT/'assets/characters/mochi'/f'sequence-30-{view}'
    manifest=json.loads((directory/'manifest.json').read_text())
    for variant in manifest['variants']:
        w,h=variant['frameWidth'],variant['frameHeight']
        pages=[Image.open(directory/p['file']).convert('RGBA') for p in variant['pages']]
        unique=set();bottoms=[]
        for i,f in enumerate(variant['layers'][0]['frames']):
            frame=pages[f['page']].crop((f['x'],f['y'],f['x']+w,f['y']+h))
            alpha=np.array(frame.getchannel('A'));ys,xs=np.where(alpha>40)
            assert xs.min()>0 and xs.max()<w-1 and ys.min()>0 and ys.max()<h-1,(view,w,i,'clipped')
            # Detached source-grid lines above the head must not survive packing.
            for row in alpha[:ys.min()+max(1,round(8*w/640))]:
                assert (row>2).sum()<w*.5,(view,w,i,'head strip')
            crop=manifest['crop'];scale=w/320
            assert xs.min()>=crop['x']*scale-1 and xs.max()<=(crop['x']+crop['width'])*scale+1
            unique.add(frame.tobytes());bottoms.append(ys.max())
        assert len(unique)==30,(view,w,'duplicate frames')
        assert max(bottoms)-min(bottoms)<=2,(view,w,'unstable ground/crop registration')
        print(f'PASS {view}/{w}: 30 unique transparent frames; registered bounds and no head strips')
