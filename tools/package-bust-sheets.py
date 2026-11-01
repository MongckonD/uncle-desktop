"""Extract six authored upper-body poses without enlarging their source pixels.

Usage: python tools/package-bust-sheets.py NAME SHEET.png OUTPUT_DIR
Imagegen sheets have 3x2 cells. Padding creates a 640x840 registration canvas;
the source art remains its original 512x512 pixels, not native 640x840 detail.
"""
import importlib.util
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import label, binary_dilation

ROOT=Path(__file__).resolve().parents[1]
module=importlib.util.spec_from_file_location('packer', ROOT/'tools/pack-character.py')
packer=importlib.util.module_from_spec(module)
module.loader.exec_module(packer)


def main(name, source, output):
    assert name in ('mochi','lili','luna','pudding','tama')
    image=Image.open(source).convert('RGBA')
    assert image.size==(1536,1024),f'Expected 3x2 cells of 512x512, got {image.size}'
    assert image.getchannel('A').getextrema()[0] == 0, 'Transparent artwork required'
    frames=[]
    for i in range(6):
        cell=np.array(image.crop(((i%3)*512,(i//3)*512,(i%3+1)*512,(i//3+1)*512)))
        components,count=label(cell[:,:,3]>80)
        sizes=np.bincount(components.ravel())
        assert count and sizes[1:].max()>10000, f'No figure in cell {i}'
        main_id=1+np.argmax(sizes[1:])
        keep=binary_dilation(components==main_id,iterations=2)
        cell[:,:,3]=np.where(keep,cell[:,:,3],0)
        frame=Image.new('RGBA',(640,840))
        # Native 512px artwork; no fake resolution increase.
        frame.alpha_composite(Image.fromarray(cell),(64,164))
        frames.append(frame)
    tracks={'idle':[0,0,0,0,0,1,0,3,0], 'thinking':[4], 'attention':[2,0],
            'success':[3], 'error':[4], 'sleep':[5], 'talk':[0,2], 'blink':[0,1,0], 'wave':[0,3,0]}
    spec={'rigged':False,'sourceDetail':'512x512 native artwork per upper-body pose, padded to 640x840; no upscaling'}
    result=packer.pack(spec,[({'id':'upper-body','role':'composite','tracks':tracks},frames)],Path(output),(640,),2048)
    # Preserve standalone full-quality expressions for the chat panel and QA.
    for state,index in [('portrait',0),('thinking',4),('attention',2),('success',3),('error',4),('sleep',5)]:
        frames[index].crop((64,164,576,676)).save(Path(output)/(state+'.png'))
    print(json.dumps({'name':name,'nativeCell':[512,512],'frame':[640,840],'atlasPages':len(result['variants'][0]['pages'])}))


if __name__=='__main__': main(*sys.argv[1:])
