// Logical geometry stays 320x420. Only texture storage changes with resolution.
export const RESOLUTIONS = [320, 640, 960];
export const ATLAS_BUDGET = 64 * 1024 * 1024;
export const GROUP_BUDGET = ATLAS_BUDGET / 2;
export function dimensions(character) {
  const width = character.frameWidth ?? 320, height = character.frameHeight ?? 420;
  if (!RESOLUTIONS.includes(width) || height !== width * 420 / 320) throw new Error('Invalid frame resolution');
  return { width, height };
}
export function atlasRect(frame, character, crop = {x:0,y:0,width:320,height:420}) {
  const {width,height} = dimensions(character), ratio = width / 320;
  return {x:(frame % character.columns) * width + crop.x * ratio,
    y:Math.floor(frame / character.columns) * height + crop.y * ratio,
    width:crop.width * ratio,height:crop.height * ratio};
}
export function chooseVariant(variants, density, maxTexture = 4096, budget = GROUP_BUDGET) {
  const eligible = variants.filter(v => {
    dimensions(v);
    const pages = v.pages;
    if (!pages?.length || pages.some(p => p.width > maxTexture || p.height > maxTexture || p.width < 1 || p.height < 1)) return false;
    // A composite can reference one page per layer. Reserve the worst case,
    // including two different face poses sharing an animation frame.
    const worst = [...pages].sort((a,b)=>b.width*b.height-a.width*a.height)
      .slice(0, v.layers.length).reduce((sum,p)=>sum+p.width*p.height*4,0);
    return worst <= budget;
  }).sort((a,b)=>a.frameWidth-b.frameWidth);
  return eligible.find(v => v.frameWidth >= 320 * density) || eligible.at(-1) || null;
}

export function validateManifest(m) {
  if (m?.version !== 2 || !Array.isArray(m.variants) || !m.variants.length || m.variants.length > 3) throw new Error('Invalid sprite manifest');
  if(m.crop && (!['x','y','width','height'].every(k=>Number.isFinite(m.crop[k])) || m.crop.x<0 || m.crop.y<0 || m.crop.width<=0 || m.crop.height<=0 || m.crop.x+m.crop.width>320 || m.crop.y+m.crop.height>420 || Math.abs(m.crop.width/m.crop.height-320/420)>.001))throw new Error('Invalid view crop');
  for (const v of m.variants) {
    dimensions(v);
    if (!Array.isArray(v.pages) || !v.pages.length || v.pages.length > 512 || !Array.isArray(v.layers) || !v.layers.length || v.layers.length > 12) throw new Error('Invalid layer/page budget');
    for (const p of v.pages) {
      if (!Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width < 1 || p.height < 1 || p.width > 8192 || p.height > 8192 || typeof p.file !== 'string' || !/^[\w./-]+$/.test(p.file) || p.file.split('/').includes('..') || p.file.startsWith('/')) throw new Error('Invalid atlas page');
    }
    const ids = new Set();
    for (const l of v.layers) {
      if (!l.id || ids.has(l.id) || (l.parent && !ids.has(l.parent)) || !Array.isArray(l.frames) || !l.frames.length || l.frames.length > 256) throw new Error('Invalid layer hierarchy');
      ids.add(l.id);
      for (const f of l.frames) {
        const p = v.pages[f.page];
        if (!p || !Number.isInteger(f.x) || !Number.isInteger(f.y) || f.x < 0 || f.y < 0 || f.x + v.frameWidth > p.width || f.y + v.frameHeight > p.height) throw new Error('Frame outside atlas');
        if (f.anchor && (f.anchor.length !== 2 || !f.anchor.every(Number.isFinite))) throw new Error('Invalid face registration');
      }
      for (const seq of Object.values(l.tracks || {})) if (!Array.isArray(seq) || !seq.length || seq.some(i=>!Number.isInteger(i)||i<0||i>=l.frames.length)) throw new Error('Invalid animation track');
      for (const key of ['pivot','clip']) if (l[key] && (!Array.isArray(l[key]) || l[key].length !== (key==='pivot'?2:4) || !l[key].every(Number.isFinite))) throw new Error('Invalid rig geometry');
    }
  }
  return m;
}

let textureLimit;
export function gpuTextureLimit() {
  if (textureLimit) return textureLimit;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  textureLimit = Math.min(8192, gl?.getParameter(gl.MAX_TEXTURE_SIZE) || 2048);
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return textureLimit;
}

// Shared across desktop and gallery. Groups are decoded serially, so transient
// decodes cannot multiply the budget during rapid character switches.
export class AtlasCache {
  constructor({budget=ATLAS_BUDGET,decode=decodeImage}={}) { this.budget=budget;this.decode=decode;this.entries=new Map();this.bytes=0;this.queue=Promise.resolve(); }
  async group(pages, consume) {
    const run = async () => {
      const unique=[...new Map(pages.map(p=>[p.url,p])).values()];
      const needed=unique.reduce((n,p)=>n+p.width*p.height*4,0);
      if (needed > this.budget) throw new Error('Atlas group exceeds memory budget');
      const keep=new Set(unique.map(p=>p.url));
      for (const p of unique) {
        const bytes=p.width*p.height*4;
        if (!this.entries.has(p.url)) {
          for (const [url,old] of this.entries) {
            if (this.bytes+bytes<=this.budget) break;
            if (keep.has(url)) continue;
            old.image.close?.();this.bytes-=old.bytes;this.entries.delete(url);
          }
          if(this.bytes+bytes>this.budget) throw new Error('Atlas cache budget exhausted');
          const image=await this.decode(p.url);
          if ((image.width||image.naturalWidth)!==p.width || (image.height||image.naturalHeight)!==p.height) {image.close?.();throw new Error('Atlas size mismatch');}
          this.entries.set(p.url,{image,bytes});this.bytes+=bytes;
        }
        const item=this.entries.get(p.url);this.entries.delete(p.url);this.entries.set(p.url,item);
      }
      return consume(pages.map(p=>this.entries.get(p.url).image));
    };
    const result=this.queue.then(run);this.queue=result.catch(()=>{});return result;
  }
  clear() {for(const {image} of this.entries.values())image.close?.();this.entries.clear();this.bytes=0;}
}
async function decodeImage(url) {
  const image=new Image();image.src=url;await image.decode();
  // ImageBitmap has an explicit release operation, unlike a retained HTMLImage.
  const bitmap=await createImageBitmap(image);image.src='';return bitmap;
}
export const atlasCache = new AtlasCache();
export function assetURL(character, path) {return character.custom ? path : new URL(`../../assets/characters/${path}`, document.baseURI).href;}
export async function loadCharacterSource(character) {
  if (character.spriteManifest) {
    try {
      const url=assetURL(character,character.spriteManifest);
      const response=await fetch(url);if(!response.ok)throw new Error('Manifest unavailable');
      const manifest=validateManifest(await response.json());
      let bust=null;
      if(character.bustManifest) {
        try {
          const bustUrl=assetURL(character,character.bustManifest), bustResponse=await fetch(bustUrl);
          if(!bustResponse.ok)throw new Error('Upper-body artwork unavailable');
          const bustManifest=validateManifest(await bustResponse.json());
          if(chooseVariant(bustManifest.variants,1,gpuTextureLimit()))bust={manifest:bustManifest,url:bustUrl};
        }catch(error){console.warn('[sprite] using cropped full-body view:',error.message);}
      }
      const variant=chooseVariant(manifest.variants,1,gpuTextureLimit());
      if(!variant)throw new Error('No compatible atlas');
      const mask=document.createElement('canvas');mask.width=320;mask.height=420;
      const selected=variant.layers.map(l=>l.frames[l.tracks?.idle?.[0]||0]);
      const pages=selected.map(f=>({...variant.pages[f.page],url:new URL(variant.pages[f.page].file,url).href}));
      await atlasCache.group(pages,images=>{
        const ctx=mask.getContext('2d');
        const crop=manifest.crop || {x:0,y:0,width:320,height:420};
        ctx.save();ctx.scale(320/crop.width,420/crop.height);ctx.translate(-crop.x,-crop.y);
        for(let i=0;i<images.length;i++){const f=selected[i],a=f.anchor||[0,0];ctx.drawImage(images[i],f.x,f.y,variant.frameWidth,variant.frameHeight,a[0],a[1],320,420);}
        ctx.restore();
      });
      return {manifest,url,character,bust,initialPixels:mask.getContext('2d').getImageData(0,0,320,420).data};
    } catch(error) {console.warn('[sprite] using legacy atlas:',error.message);}
  }
  const image=new Image();image.src=assetURL(character,character.atlas);await image.decode();return image;
}
