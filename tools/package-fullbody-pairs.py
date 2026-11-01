"""Create a six-pose full-body atlas from three transparent 2-pose sheets.

Usage: python tools/package-fullbody-pairs.py CHARACTER IDLE.png THINK.png HAPPY.png OUTPUT
All figures are downsampled (never enlarged), registered to a common head and
floor, and stored in 640x840 cells. Source artwork must contain six separate,
uncropped figures. Existing full-body atlases remain available as fallback.
"""
import importlib.util
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import label, find_objects, binary_dilation

ROOT=Path(__file__).resolve().parents[1]
module=importlib.util.spec_from_file_location('packer',ROOT/'tools/pack-character.py')
packer=importlib.util.module_from_spec(module);module.loader.exec_module(packer)


def extract(path, select_first_two_of_six=False, select_all_six=False):
    image=Image.open(path).convert('RGBA')
    rgba=np.asarray(image)
    assert rgba[:,:,3].min()==0,'Transparent source required'
    components,_=label(rgba[:,:,3]>80)
    counts=np.bincount(components.ravel())
    figures=[(i,box) for i,box in enumerate(find_objects(components),1) if box and counts[i]>10000]
    if select_all_six:
        assert len(figures)==6,f'{path}: expected six isolated figures, got {len(figures)}'
        figures.sort(key=lambda p:(p[1][0].start+p[1][0].stop)/2)
        figures=sorted(figures[:3],key=lambda p:p[1][1].start)+sorted(figures[3:],key=lambda p:p[1][1].start)
    elif select_first_two_of_six:
        assert len(figures)==6,f'{path}: expected six isolated figures, got {len(figures)}'
        figures.sort(key=lambda p:(p[1][0].start+p[1][0].stop)/2)
        figures=sorted(figures[:3],key=lambda p:p[1][1].start)[:2]
    if not select_all_six:
        assert len(figures)==2,f'{path}: expected two isolated figures, got {len(figures)}'
        figures.sort(key=lambda p:p[1][1].start)
    out=[]
    for i,(ys,xs) in figures:
        assert xs.start>1 and ys.start>1 and xs.stop<image.width-1 and ys.stop<image.height-1, f'{path}: figure clipped'
        keep=binary_dilation(components==i,iterations=2)
        copy=rgba.copy();copy[:,:,3]=np.where(keep,copy[:,:,3],0)
        bounds=(max(0,xs.start-2),max(0,ys.start-2),min(image.width,xs.stop+2),min(image.height,ys.stop+2))
        pose=Image.fromarray(copy).crop(bounds)
        head=pose.getchannel('A').crop((0,0,pose.width,round(pose.height*.2))).getbbox()
        out.append((pose,(head[0]+head[2])/2))
    return out


def main(name, paths, output):
    # Mochi's replacement neutral pose was rejected; the previously generated
    # six-pose sheet keeps her costume consistent between expressions.
    poses=extract(paths[0],select_all_six=True) if name=='mochi' else [pair for path in paths for pair in extract(path)]
    reach=max(max(cx,pose.width-cx)/pose.height for pose,cx in poses)
    # Ensure every image fits without inventing pixels by magnification.
    height=min(780,292/reach, min(pose.height for pose,_ in poses))
    assert height>=420, f'{name}: actual source detail too small ({height:.0f}px)'
    frames=[]
    for pose,cx in poses:
        ratio=height/pose.height
        pose=pose.convert('RGBa').resize((round(pose.width*ratio),round(pose.height*ratio)),Image.Resampling.LANCZOS).convert('RGBA')
        frame=Image.new('RGBA',(640,840));frame.alpha_composite(pose,(round(320-cx*ratio),834-pose.height))
        bounds=frame.getchannel('A').getbbox()
        assert bounds[0]>0 and bounds[2]<640 and bounds[3]<840,'Registered pose clipped'
        frames.append(frame)
    tracks={'idle':[0,0,0,0,0,1,0,0], 'blink':[0,1,0], 'thinking':[2],
            'attention':[3], 'success':[4], 'error':[2], 'sleep':[5], 'wave':[3], 'talk':[0,3]}
    if name=='mochi': tracks.update(attention=[5],success=[3,4],sleep=[1],wave=[3,4],talk=[0,5])
    spec={'rigged':False,'sourceDetail':f'Six new full-body poses, true figure height {height:.0f}px; no upscaling'}
    manifest=packer.pack(spec,[({'id':'body','role':'composite','tracks':tracks},frames)],Path(output),(320,640),2048)
    if name=='mochi':
        # Source is naturally smaller than the others; tighten the registered
        # viewport without enlarging the stored artwork or cutting its tail.
        manifest['crop']={'x':65,'y':168.625,'width':190,'height':249.375}
        (Path(output)/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'character':name,'nativeFigureHeight':round(height),'frames':len(frames)}))


if __name__=='__main__':
    assert len(sys.argv)==6,__doc__
    main(sys.argv[1],[Path(p) for p in sys.argv[2:5]],sys.argv[5])
