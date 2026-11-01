"""Replace only Luna's damaged bust emphasis frame with a single authored pose."""
import importlib.util
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import label,binary_dilation

ROOT=Path(__file__).resolve().parents[1]
source=ROOT.parent/'character-sources/luna-face-0.22'
out=ROOT/'assets/characters/luna/face-0.22-bust'
manifest=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
variant=max(manifest['variants'],key=lambda v:v['frameWidth'])
layer=variant['layers'][0]
frames=[]
for frame in layer['frames']:
    page=Image.open(out/variant['pages'][frame['page']]['file']).convert('RGBA')
    frames.append(page.crop((frame['x'],frame['y'],frame['x']+640,frame['y']+840)))
index=layer['tracks']['talkEmphasis'][0]
image=Image.open(source/'bust-emphasis-single.png').convert('RGBA')
pixels=np.array(image)
labels,_=label(pixels[:,:,3]>80)
counts=np.bincount(labels.ravel());main=1+np.argmax(counts[1:])
keep=binary_dilation(labels==main,iterations=2)
pixels[:,:,3]=np.where(keep,pixels[:,:,3],0)
pixels[pixels[:,:,3]==0,:3]=0
image=Image.fromarray(pixels)
left,top,right,bottom=image.getchannel('A').getbbox()
assert top>8,'Head is cropped at source image boundary'
# Only the waist may intentionally be cropped; hands/head must have side space.
upper=pixels[:round(image.height*.75),:,3]>80
assert not upper[:,:4].any() and not upper[:,-4:].any(),'Source hand is clipped'
pose=image.crop((left,top,right,bottom))
head=pose.getchannel('A').crop((0,0,pose.width,round(pose.height*.15))).getbbox()
cx=(head[0]+head[2])/2
crop=manifest['crop']
min_x=crop['x']*2+8;max_x=(crop['x']+crop['width'])*2-8
scale=min(1,507/pose.height,(320-min_x)/cx,(max_x-320)/(pose.width-cx))
pose=pose.convert('RGBa').resize((round(pose.width*scale),round(pose.height*scale)),Image.Resampling.LANCZOS).convert('RGBA')
replacement=Image.new('RGBA',(640,840))
replacement.alpha_composite(pose,(round(320-cx*scale),327))
bounds=replacement.getchannel('A').getbbox()
assert bounds[0]>=min_x-2 and bounds[2]<=max_x+2,'Hand escaped the visible viewport'
assert bounds[3]<840,'Waist escaped registration canvas'
replacement.save(source/'bust-emphasis-registered.png')
frames[index]=replacement
success_index=layer['tracks']['success'][0]
frames[success_index]=replacement.copy()
repaired={index,success_index}
strip_frames=[]
for i,frame in enumerate(frames):
    pixels=np.array(frame)
    counts=np.count_nonzero(pixels[:,:,3]>80,axis=1)
    top=int(np.where(counts>0)[0][0])
    # Only a grid-edge scanline is wider than the head in its first four rows.
    rows=[y for y in range(top,min(top+4,840)) if counts[y]>640*.45]
    if rows:
        pixels[rows,:,:]=0
        frames[i]=Image.fromarray(pixels)
        strip_frames.append(i);repaired.add(i)
spec=importlib.util.spec_from_file_location('packer',ROOT/'tools/pack-character.py')
packer=importlib.util.module_from_spec(spec);spec.loader.exec_module(packer)
detail=manifest['sourceDetail'].split('; emphasis replaced')[0]+'; emphasis replaced from isolated source'
updated=packer.pack({'sourceDetail':detail},
    [({k:v for k,v in layer.items() if k!='frames'},frames)],out,tuple(v['frameWidth'] for v in manifest['variants']),2048)
updated['crop']=crop
(out/'manifest.json').write_text(json.dumps(updated,indent=2)+'\n',encoding='utf-8')
result=max(updated['variants'],key=lambda v:v['frameWidth'])
for i,frame in enumerate(result['layers'][0]['frames']):
    if i in repaired:continue
    page=Image.open(out/result['pages'][frame['page']]['file']).convert('RGBA')
    actual=page.crop((frame['x'],frame['y'],frame['x']+640,frame['y']+840))
    before=np.array(frames[i].convert('RGBa')).astype(int)
    after=np.array(actual.convert('RGBa')).astype(int)
    assert np.max(np.abs(before-after))<=2,f'Unrelated frame {i} changed'
print(json.dumps({'replacedFrames':[index,success_index],'removedStripFrames':strip_frames,'nativeRegisteredHeight':pose.height,'bounds':bounds,'otherFramesUnchanged':len(frames)-len(repaired)}))
catalog=ROOT/'assets/characters/catalog.json'
characters=json.loads(catalog.read_text(encoding='utf-8'))
luna=next(c for c in characters if c['id']=='luna')
luna['secondaryMotion'].setdefault('bustFrames',{})[str(index)]=[
    {'x':142,'y':330,'rx':27,'ry':23},{'x':194,'y':330,'rx':27,'ry':23}]
luna['secondaryMotion']['bustFrames'][str(success_index)]=luna['secondaryMotion']['bustFrames'][str(index)]
catalog.write_text(json.dumps(characters,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
