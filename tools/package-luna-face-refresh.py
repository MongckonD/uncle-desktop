"""Pack four newly authored Luna sheets; never retain frames with the old face.

python tools/package-luna-face-refresh.py ../character-sources/luna-face-0.22
Only extracts and registers supplied artwork, with no source upscaling.
"""
import importlib.util
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'tools'/file)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result
packer=module('packer','pack-character.py')
extractor=module('conversation','package-conversation-poses.py')
source=Path(sys.argv[1])
catalog=ROOT/'assets/characters/catalog.json'
characters=json.loads(catalog.read_text(encoding='utf-8'))
character=next(c for c in characters if c['id']=='luna')
tracks={'idle':[0],'blink':[0,1,0],'thinking':[2],'attention':[3],
        'success':[4],'error':[5],'sleep':[1],'wave':[3],
        'talkNeutral':[6],'talkPrepare':[7],'talkSoft':[8],
        'talkRound':[9],'talkEmphasis':[10],'talkRest':[11],'talk':[8,9,10]}
for view in (['bust'] if '--bust' in sys.argv[2:] else ['full','bust']):
    gutter=4 if view=='bust' else 0
    poses=extractor.source_poses(source/f'{view}-states.png',row_gutter=gutter)+extractor.source_poses(source/f'{view}-speaking.png',row_gutter=gutter)
    height=min(780,*(p.height for p in poses),*(610*p.height/p.width for p in poses))
    frames=[]
    for pose in poses:
        scale=height/pose.height
        assert scale<=1,'Do not enlarge low-resolution source art'
        pose=pose.convert('RGBa').resize((round(pose.width*scale),round(height)),Image.Resampling.LANCZOS).convert('RGBA')
        head=pose.getchannel('A').crop((0,0,pose.width,round(pose.height*.15))).getbbox()
        cx=(head[0]+head[2])/2
        frame=Image.new('RGBA',(640,840))
        frame.alpha_composite(pose,(round(320-cx),834-pose.height))
        frames.append(frame)
    # A separately authored wide gesture avoids the neighboring-row/cell cut.
    replacement=source/'bust-emphasis-registered.png'
    if view=='bust' and replacement.is_file():
        frame=Image.open(replacement).convert('RGBA')
        assert frame.size==(640,840)
        frames[10]=frame
        frames[4]=frame.copy()
    out=ROOT/'assets/characters/luna'/f'face-0.22-{view}'
    manifest=packer.pack({'sourceDetail':f'New reference-matched face in all twelve {view} poses; native figure {height:.0f}px, no upscaling'},
        [({'id':'body','role':'composite','tracks':tracks},frames)],out,(320,640),2048)
    bounds=Image.fromarray(np.maximum.reduce([np.array(f.getchannel('A')) for f in frames])).getbbox()
    left,top,right,bottom=bounds
    width=min(640,max(right-left+12,(bottom-top+12)*320/420))
    crop_height=width*420/320
    manifest['crop']={'x':max(0,min(640-width,(left+right-width)/2))/2,
        'y':max(0,min(840-crop_height,bottom+6-crop_height))/2,'width':width/2,'height':crop_height/2}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    character['bustManifest' if view=='bust' else 'spriteManifest']=f'luna/{out.name}/manifest.json'
    frames[0].save(source/f'{view}-registered.png')
    if view=='bust':
        for state,index in [('portrait',0),('thinking',2),('attention',3),('success',4),('error',5),('sleep',1)]:
            top=frames[index].getchannel('A').getbbox()[1]
            pose=frames[index].crop((160,top,480,min(top+320,840)))
            pose.save(ROOT/'assets/characters/luna'/f'{state}.png')
    else:
        # Legacy fallback must use the new face too.
        atlas=Image.new('RGBA',(1280,2520))
        for row,index in enumerate([0,2,3,4,5,1]):
            for col in range(4):
                frame=frames[index].convert('RGBa').resize((320,420),Image.Resampling.LANCZOS).convert('RGBA')
                atlas.alpha_composite(frame,(col*320,row*420))
        atlas.save(ROOT/'assets/characters/luna/atlas.webp',lossless=True,method=6)
    print(json.dumps({'view':view,'nativeHeight':height,'frames':len(frames),'crop':manifest['crop']}))
character['conversationPoses']=6
character['motionBaseManifest']=character['spriteManifest']
character['motionBaseBustManifest']=character['bustManifest']
character['secondaryMotion']['full']=[{'x':149,'y':165,'rx':20,'ry':18},{'x':174,'y':165,'rx':20,'ry':18}]
character['secondaryMotion']['bust']=[{'x':132,'y':351,'rx':30,'ry':26},{'x':180,'y':351,'rx':30,'ry':26}]
catalog.write_text(json.dumps(characters,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
