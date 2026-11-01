"""Append six new conversation poses while retaining every existing state.

python tools/package-conversation-poses.py CHARACTER SHEET [--bust]
Only extracts, downsamples and registers source art. It never enlarges it.
"""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.util.spec_from_file_location('packer', ROOT / 'tools/pack-character.py')
packer = importlib.util.module_from_spec(loader)
loader.loader.exec_module(packer)


def source_poses(path, row_gutter=0):
    image = Image.open(path).convert('RGBA')
    assert image.getchannel('A').getextrema()[0] == 0, 'Actual transparency required'
    assert image.width >= 900 and image.height >= 900, 'Source detail too small'
    poses = []
    for i in range(6):
        cell = np.array(image.crop((round(i % 3 * image.width / 3),
            round(i // 3 * image.height / 2), round((i % 3 + 1) * image.width / 3),
            round((i // 3 + 1) * image.height / 2))))
        if i>=3 and row_gutter:
            # Discard the previous row's pixels before filtering/resizing can
            # spread a one-pixel seam into translucent ringing around the head.
            cell[:row_gutter,:,:]=0
        components, count = label(cell[:, :, 3] > 80)
        sizes = np.bincount(components.ravel())
        assert count and sizes[1:].max() > 10000, f'Missing figure in cell {i}'
        keep = binary_dilation(components == (1 + np.argmax(sizes[1:])), iterations=2)
        cell[:, :, 3] = np.where(keep, cell[:, :, 3], 0)
        cell[cell[:, :, 3] == 0, :3] = 0
        pose = Image.fromarray(cell)
        bounds = pose.getchannel('A').getbbox()
        assert bounds and bounds[3] - bounds[1] > 250
        poses.append(pose.crop(bounds))
    assert len({p.tobytes() for p in poses}) == 6, 'Need six distinct authored poses'
    return poses


def existing(character, bust):
    key = 'bustManifest' if bust else 'spriteManifest'
    base_key = 'motionBaseBustManifest' if bust else 'motionBaseManifest'
    relative = character.get(base_key, character.get(key))
    if relative:
        path = ROOT / 'assets/characters' / relative
        manifest = json.loads(path.read_text(encoding='utf-8'))
        variant = max(manifest['variants'], key=lambda v: v['frameWidth'])
        assert len(variant['layers']) == 1, 'Keep authored layered rigs in their own pipeline'
        layer = variant['layers'][0]
        frames = []
        for frame in layer['frames']:
            with Image.open(path.parent / variant['pages'][frame['page']]['file']) as page:
                frames.append(page.convert('RGBA').crop((frame['x'], frame['y'],
                    frame['x'] + variant['frameWidth'], frame['y'] + variant['frameHeight'])))
        return frames, dict(layer['tracks']), relative
    image = Image.open(ROOT / 'assets/characters' / character['atlas']).convert('RGBA')
    frames = [image.crop((i % 4 * 320, i // 4 * 420, (i % 4 + 1) * 320,
        (i // 4 + 1) * 420)) for i in range(24)]
    tracks = {state: list(range(i * 4, i * 4 + 4)) for i, state in enumerate(packer.STATES)}
    tracks['blink'] = [0, 1, 0]
    return frames, tracks, None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('character')
    parser.add_argument('sheet', type=Path)
    parser.add_argument('--bust', action='store_true')
    args = parser.parse_args()
    catalog = ROOT / 'assets/characters/catalog.json'
    characters = json.loads(catalog.read_text(encoding='utf-8'))
    character = next(c for c in characters if c['id'] == args.character)
    assert character.get('renderer') != 'capri' and not character.get('stillImage')
    authored = source_poses(args.sheet)
    old, tracks, base = existing(character, args.bust)
    old = [p.crop(p.getchannel('A').getbbox()) for p in old]
    neutral = old[tracks['idle'][0]]
    all_poses = old + authored
    reach = max(p.width / p.height for p in all_poses)
    height = min(780, neutral.height, *(p.height for p in authored), 610 / reach)
    assert height >= 250, 'Too little source detail after registration'
    frames = []
    for i, pose in enumerate(all_poses):
        # Existing state proportions use one shared scale, new cells use their
        # common reference height to correct generator registration differences.
        scale = min(1, height / (neutral.height if i < len(old) else pose.height))
        scale = min(scale, 620 / pose.width, 810 / pose.height)
        size = (max(1, round(pose.width * scale)), max(1, round(pose.height * scale)))
        pose = pose.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')
        frame = Image.new('RGBA', (640, 840))
        frame.alpha_composite(pose, ((640 - pose.width) // 2, 834 - pose.height))
        frames.append(frame)
    start = len(old)
    for name, index in [('talkNeutral', 0), ('talkPrepare', 1), ('talkSoft', 2),
                        ('talkRound', 3), ('talkEmphasis', 4), ('talkRest', 5)]:
        tracks[name] = [start + index]
    tracks['talk'] = [start + 2, start + 3, start + 4]
    # Idle is a held neutral pose; the runtime schedules irregular blinks.
    tracks['idle'] = [tracks['idle'][0]]
    suffix = 'motion-bust' if args.bust else 'motion-full'
    out = ROOT / 'assets/characters' / character['id'] / suffix
    manifest = packer.pack({'sourceDetail': f'Preserved states plus six new native conversation poses; '
        f'figure height {height:.0f}px, no enlargement'},
        [({'id': 'body', 'role': 'composite', 'tracks': tracks}, frames)], out, (320, 640), 2048)
    bounds = Image.new('L', (640, 840))
    for frame in frames:
        bounds = Image.fromarray(np.maximum(np.array(bounds), np.array(frame.getchannel('A'))))
    left, top, right, bottom = bounds.getbbox()
    width = min(640, max(right - left + 12, (bottom - top + 12) * 320 / 420))
    crop_height = width * 420 / 320
    manifest['crop'] = {'x': max(0, min(640 - width, (left + right - width) / 2)) / 2,
        'y': max(0, min(840 - crop_height, bottom + 6 - crop_height)) / 2,
        'width': width / 2, 'height': crop_height / 2}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    key = 'bustManifest' if args.bust else 'spriteManifest'
    base_key = 'motionBaseBustManifest' if args.bust else 'motionBaseManifest'
    if base_key not in character:
        character[base_key] = base
    character[key] = f'{character["id"]}/{suffix}/manifest.json'
    character['conversationPoses'] = 6
    catalog.write_text(json.dumps(characters, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'character': character['id'], 'view': suffix, 'frames': len(frames),
        'sourceFigureHeight': round(height), 'crop': manifest['crop']}))


if __name__ == '__main__':
    main()
