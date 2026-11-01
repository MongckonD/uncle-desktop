// Audio drives gestures; each renderer owns its clock and variation sequence.
export function dancePose(now,enabled) {
  if(!enabled)return {x:0,y:0,angle:0};
  const phase=now/1000*Math.PI*2*1.8;
  return {x:Math.sin(phase/2)*5,y:-Math.pow(Math.sin(phase),2)*8,angle:Math.sin(phase/2)*.03};
}
export class ConversationMotion {
  constructor(seed = 'character', {orderedSpeech=false} = {}) {
    this.orderedSpeech=orderedSpeech;
    this.speechPath=null;
    this.speechStep=0;
    this.speechAt=0;
    this.lastSpeechPath=-1;
    this.ambientState=null;
    this.ambientPath=null;
    this.lastAmbientPath=-1;
    this.seed = [...seed].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 1);
    this.energy = 0;
    this.last = null;
    this.lastSound = -Infinity;
    this.voiceStarted = null;
    this.nextGesture = 0;
    this.gesture = 'talkSoft';
    this.gestureVariant = 0;
    this.nextBlink = 2200 + this.random() * 3500;
    this.blinkUntil = 0;
  }

  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  orderedFrame(now,allowed,active) {
    if(!allowed){this.speechPath=null;return undefined;}
    if(!active){this.speechPath=null;return now-this.lastSound<420?5:undefined;}
    if(!this.speechPath || now>=this.speechAt) {
      if(this.speechPath)this.speechStep++;
      if(!this.speechPath || this.speechStep>=this.speechPath.length) {
        const resting=!!this.speechPath;
        const paths=[[0,1,2,3,4,5],[0,1,2,1,0],[0,1,2,3,2,1,0]];
        const choices=paths.map((_,i)=>i).filter(i=>i!==this.lastSpeechPath);
        this.lastSpeechPath=choices[Math.floor(this.random()*choices.length)];
        this.speechPath=paths[this.lastSpeechPath];
        this.speechStep=0;
        this.speechAt=now+(resting?300+this.random()*350:150);
      } else this.speechAt=now+130+this.random()*80;
    }
    return this.speechPath[this.speechStep];
  }

  ambientFrame(now,state,enabled) {
    if(!enabled){this.ambientState=null;return undefined;}
    if(this.ambientState!==state){this.ambientState=state;this.ambientPath=null;this.ambientAt=now+700+this.random()*1800;}
    if(now>=this.ambientAt){
      if(!this.ambientPath){
        const paths=[[0,1,0],[0,1,2,3,1,0],[0,3,1,0]];
        const choices=paths.map((_,i)=>i).filter(i=>i!==this.lastAmbientPath);
        this.lastAmbientPath=choices[Math.floor(this.random()*choices.length)];
        this.ambientPath=paths[this.lastAmbientPath];this.ambientStep=0;
      }else this.ambientStep++;
      if(this.ambientStep>=this.ambientPath.length){this.ambientPath=null;this.ambientAt=now+900+this.random()*2300;}
      else this.ambientAt=now+220+this.random()*160;
    }
    return this.ambientPath?.[this.ambientStep]??0;
  }

  update(now, { talk = 0, state = 'idle', still = false, dance = false } = {}) {
    const dt = this.last === null ? 1 / 60 : Math.max(0, Math.min(.1, (now - this.last) / 1000));
    this.last = now;
    const raw = Number.isFinite(talk) ? Math.max(0, Math.min(1, talk)) : 0;
    this.energy += (raw - this.energy) * (1 - Math.exp(-dt * (raw > this.energy ? 18 : 12)));
    const allowed = !still && (state === 'idle' || state === 'thinking');
    let speechPose = null;
    if (allowed && raw > .04) {
      if (this.voiceStarted === null) {
        this.voiceStarted = now;
        this.nextGesture = now + 100;
      }
      this.lastSound = now;
      if (now >= this.nextGesture) {
        const choices = ['talkSoft', 'talkRound', 'talkEmphasis'].filter(pose => pose !== this.gesture);
        this.gesture = choices[Math.floor(this.random() * choices.length)];
        this.gestureVariant++;
        this.nextGesture = now + 550 + this.random() * 650;
      }
      speechPose = now - this.voiceStarted < 100 ? 'talkPrepare' : this.gesture;
    } else {
      // Close the mouth on an audio pause, without waiting for the gesture timer.
      if (allowed && now - this.lastSound < 420) speechPose = 'talkRest';
      this.voiceStarted = null;
      if (!allowed) this.lastSound = -Infinity;
    }
    if (!allowed) this.energy = 0;
    if (now >= this.nextBlink) {
      this.blinkUntil = now + 110;
      this.nextBlink = now + 2600 + this.random() * 3900;
    }
    const time = now / 1000;
    const speechFrame=this.orderedSpeech?this.orderedFrame(now,allowed,raw>.04):undefined;
    if(Number.isInteger(speechFrame))speechPose=['talkPrepare','talkPrepare','talkSoft','talkRound','talkEmphasis','talkRest'][speechFrame];
    const ambientFrame=this.orderedSpeech?this.ambientFrame(now,state,allowed&&!speechPose):undefined;
    const dancing=dancePose(now,!still && state==='idle' && raw<=.04 && dance);
    return {
      speechPose,
      speechFrame,
      ambientFrame,
      danceX:dancing.x,danceY:dancing.y,
      directed: true,
      gestureVariant: this.gestureVariant,
      blink: allowed && now < this.blinkUntil,
      energy: this.energy,
      // A planted-foot pivot keeps subtle breathing and speech emphasis continuous.
      angle: allowed ? Math.sin(time * .83) * .002 + Math.sin(time * 2.7) * this.energy * .003+dancing.angle : 0,
      breath: allowed ? Math.sin(time * 1.7) * .0015 + this.energy * .004 : 0,
    };
  }
}
