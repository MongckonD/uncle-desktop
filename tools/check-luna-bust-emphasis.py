"""Check every Luna pose for a neighboring-row strip above the head."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
failures=[]
cases=0
for view in ['full','bust']:
    root=Path(__file__).resolve().parents[1]/f'assets/characters/luna/face-0.22-{view}'
    manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    for variant in manifest['variants']:
        layer=variant['layers'][0]
        w,h=variant['frameWidth'],variant['frameHeight']
        for index,frame in enumerate(layer['frames']):
            page=Image.open(root/variant['pages'][frame['page']]['file']).convert('RGBA')
            alpha=np.array(page.crop((frame['x'],frame['y'],frame['x']+w,frame['y']+h)).getchannel('A'))
            mask=alpha>80
            top=int(np.where(mask.any(axis=1))[0][0])
            band=alpha[max(0,top-round(w/80)):top+max(1,round(w/160))]
            width=int(np.max(np.count_nonzero(band>2,axis=1)))
            cases+=1
            if width>=w*.45:failures.append({'view':view,'frame':index,'width':w,'strip':width})
print(json.dumps({'cases':cases,'failures':failures}))
assert not failures,'Foreign horizontal strips remain above Luna poses'
print('PASS: every Luna pose is free of neighboring-row strips at both tiers')
