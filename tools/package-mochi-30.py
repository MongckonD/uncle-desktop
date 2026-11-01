"""Register freshly authored Mochi sequences; no interpolated or enlarged art.

python tools/package-mochi-30.py [--view full|bust] [--activate]
Sources and measured physics calibration live in ../character-sources/mochi-30.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import label,binary_dilation,find_objects

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT.parent/'character-sources/mochi-30'
STATES=['idle','thinking','attention','success','error','sleep']
spec=importlib.util.spec_from_file_location('packer',ROOT/'tools/pack-character.py')
packer=importlib.util.module_from_spec(spec);spec.loader.exec_module(packer)

def extract(path,count):
    image=Image.open(path).convert('RGBA')
    assert image.getchannel('A').getextrema()[0]==0,'Real alpha required'
    rows=count//2;poses=[]
    for i in range(count):
        x0=round(i%2*image.width/2);x1=round((i%2+1)*image.width/2)
        y0=round(i//2*image.height/rows);y1=round((i//2+1)*image.height/rows)
        cell=np.array(image.crop((x0,y0,x1,y1)))
        if i>=2:cell[:4,:,:]=0
        labels,_=label(cell[:,:,3]>80);sizes=np.bincount(labels.ravel())
        assert len(sizes)>1 and sizes[1:].max()>10000,f'Missing pose {path}/{i}'
        main=1+np.argmax(sizes[1:]);keep=labels==main
        # Keep a genuinely detached tail, while rejecting neighboring cell debris.
        for number,box in enumerate(find_objects(labels),1):
            if not box or number==main or sizes[number]<sizes[main]*.03:continue
            ys,xs=box
            if xs.start>3 and xs.stop<cell.shape[1]-3 and ys.start>4:keep|=labels==number
        keep=binary_dilation(keep,iterations=2)
        cell[:,:,3]=np.where(keep,cell[:,:,3],0);cell[cell[:,:,3]==0,:3]=0
        pose=Image.fromarray(cell);bounds=pose.getchannel('A').getbbox();pose=pose.crop(bounds)
        assert pose.height>=280,f'Source detail too small {path}/{i}'
        # Hands/head may not run through a cell boundary. The waist crop in a
        # portrait may meet the lower edge, so only test the upper 80% there.
        check=cell[:round(cell.shape[0]*(.8 if path.name.startswith('bust') else 1)),:,3]>80
        assert not check[:,:1].any() and not check[:,-1:].any(),f'Clipped side in {path}/{i}'
        head=pose.getchannel('A').crop((0,0,pose.width,round(pose.height*.15))).getbbox()
        poses.append((pose,(head[0]+head[2])/2))
    assert len({p.tobytes() for p,_ in poses})==count,f'Duplicate poses in {path}'
    return poses

def build(view):
    poses=[]
    for state in STATES:poses.extend(extract(SOURCE/f'{view}-{state}.png',4))
    poses.extend(extract(SOURCE/f'{view}-speech.png',6))
    reach=max(max(cx,p.width-cx)/p.height for p,cx in poses)
    height=min(780,*(p.height for p,_ in poses),300/reach)
    frames=[]
    for pose,cx in poses:
        scale=height/pose.height
        assert scale<=1,'Do not enlarge low-resolution artwork'
        pose=pose.convert('RGBa').resize((round(pose.width*scale),round(height)),Image.Resampling.LANCZOS).convert('RGBA')
        frame=Image.new('RGBA',(640,840));frame.alpha_composite(pose,(round(320-cx*scale),834-pose.height))
        bounds=frame.getchannel('A').getbbox()
        assert bounds[0]>2 and bounds[2]<638 and bounds[3]<840,'Registration clipped a figure'
        frames.append(frame)
    tracks={s:list(range(i*4,i*4+4)) for i,s in enumerate(STATES)}
    tracks['idle']=[0,0,1,2,3,3,1,0]
    tracks.update(idleMotion=[0,1,2,3],thinkingMotion=[4,5,6,7])
    tracks.update(blink=[0,2,0],wave=[8,9,10,11],speechMotion=list(range(24,30)),talk=[26,27,28])
    for name,index in [('talkNeutral',24),('talkPrepare',25),('talkSoft',26),('talkRound',27),('talkEmphasis',28),('talkRest',29)]:tracks[name]=[index]
    out=ROOT/'assets/characters/mochi'/f'sequence-30-{view}'
    manifest=packer.pack({'sourceDetail':f'Thirty newly authored sequential {view} frames; native figure height {height:.0f}px, no upscaling'},
        [({'id':'body','role':'composite','continuousTracks':True,'tracks':tracks},frames)],out,(320,640),2048)
    bounds=Image.fromarray(np.maximum.reduce([np.array(f.getchannel('A')) for f in frames])).getbbox()
    left,top,right,bottom=bounds
    width=min(640,max(right-left+16,(bottom-top+16)*320/420));crop_height=width*420/320
    manifest['crop']={'x':max(0,min(640-width,(left+right-width)/2))/2,
        'y':max(0,min(840-crop_height,bottom+8-crop_height))/2,'width':width/2,'height':crop_height/2}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    frames[0].save(SOURCE/f'{view}-registered.png')
    grid=Image.new('RGBA',(640*6,840*5),'#30343b')
    for i,frame in enumerate(frames):grid.alpha_composite(frame,(i%6*640,i//6*840))
    grid.thumbnail((1536,1680));grid.convert('RGB').save(SOURCE/f'{view}-preview.jpg',quality=95)
    print(json.dumps({'view':view,'frames':len(frames),'sourceFigureHeight':height,'crop':manifest['crop']}))
    return frames

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--view',choices=['full','bust']);parser.add_argument('--activate',action='store_true')
    args=parser.parse_args()
    outputs={view:build(view) for view in ([args.view] if args.view else ['full','bust'])}
    if args.activate:
        assert not args.view,'Activate both completed views together'
        calibration=json.loads((SOURCE/'calibration.json').read_text(encoding='utf-8'))
        catalog=ROOT/'assets/characters/catalog.json';characters=json.loads(catalog.read_text(encoding='utf-8'))
        mochi=next(c for c in characters if c['id']=='mochi')
        mochi.update(fps=4,orderedSpeech=True,poseBlendMs=110,spriteManifest='mochi/sequence-30-full/manifest.json',
            bustManifest='mochi/sequence-30-bust/manifest.json',motionBaseManifest='mochi/sequence-30-full/manifest.json',
            motionBaseBustManifest='mochi/sequence-30-bust/manifest.json',conversationPoses=6)
        mochi['secondaryMotion'].update(calibration)
        # Keep the legacy fallback and gallery consistent with the new artwork.
        atlas=Image.new('RGBA',(1280,2520))
        for i,frame in enumerate(outputs['full'][:24]):
            frame=frame.convert('RGBa').resize((320,420),Image.Resampling.LANCZOS).convert('RGBA')
            atlas.alpha_composite(frame,(i%4*320,i//4*420))
        atlas.save(ROOT/'assets/characters/mochi/atlas.webp',lossless=True,method=6)
        for state,index in [('portrait',0),('thinking',6),('attention',10),('success',14),('error',18),('sleep',22)]:
            frame=outputs['bust'][index];top=frame.getchannel('A').getbbox()[1]
            frame.crop((160,top,480,min(top+320,840))).save(ROOT/'assets/characters/mochi'/f'{state}.png')
        catalog.write_text(json.dumps(characters,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
