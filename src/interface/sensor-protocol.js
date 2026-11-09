/* Shared serial contract. Pure functions also run in Node for transport tests. */
(function(root) {
  'use strict';
  // Flex endpoints measured on this plant. Recalibrate after mounting changes.
  // Set upright again after fastening the MPU6050 to the pot.
  const defaults = Object.freeze({flexRest:275, flexSpan:100, forceRest:0, forceSpan:800, upright:[0,0,1], tiltMax:30, flexNoise:0, forceNoise:0, tiltNoise:0});
  const adc = n => Number.isInteger(n) && n >= 0 && n <= 1023;
  const bit = n => n === 0 || n === 1;
  const axis = a => Array.isArray(a) && a.length===3 && a.every(n=>Number.isInteger(n)&&n>=-32768&&n<=32767);
  const unit = a => {const length=Math.hypot(...a);return length>0?a.map(n=>n/length):null;};
  function angle(a,b) {return Math.acos(Math.max(-1,Math.min(1,a.reduce((s,n,i)=>s+n*b[i],0))))*180/Math.PI;}
  function parse(line) {
    try {
      const f=JSON.parse(line);
      if(!f || f.type!=='plantband' || ![1,2].includes(f.v) || !Number.isInteger(f.seq) || f.seq<0 || f.seq>4294967295 ||
        !['flex','fsr'].every(k=>adc(f[k])) || !bit(f.touch) || !bit(f.pot) || typeof f.mpr!=='boolean')return null;
      if(f.v===2 && (typeof f.imu!=='boolean'||!axis(f.a)||!axis(f.g)))return null;
      if(f.v===1 && !adc(f.soil))return null;
      // Old firmware keeps flex/FSR/touch working during the upgrade. Its soil
      // field is never interpreted as motion; a new sketch is required for tilt.
      return {v:f.v,seq:f.seq,flex:f.flex,fsr:f.fsr,touch:f.mpr?f.touch:0,pot:f.mpr?f.pot:0,mpr:f.mpr,
        imu:f.v===2&&f.imu,a:f.v===2?f.a:[0,0,0],g:f.v===2?f.g:[0,0,0]};
    } catch { return null; }
  }
  class Lines {
    constructor(onFrame) { this.onFrame=onFrame;this.buffer='';this.discard=false; }
    push(text) {
      // Bound memory even if a different device sends an endless non-JSON line.
      for(const character of text) {
        if(character==='\n') {
          if(!this.discard) {const frame=parse(this.buffer);if(frame)this.onFrame(frame);}
          this.buffer='';this.discard=false;
        } else if(!this.discard) {
          if(this.buffer.length>=256) {this.buffer='';this.discard=true;}
          else this.buffer+=character;
        }
      }
    }
  }
  function validCalibration(c) {
    if (!c || !adc(c.flexRest) || !adc(c.forceRest)) return false;
    return Number.isInteger(c.flexSpan) && Math.abs(c.flexSpan)>=12 && Math.abs(c.flexSpan)<=1023 &&
      Number.isInteger(c.forceSpan) && c.forceSpan>=12 && c.forceSpan<=1023 &&
      Array.isArray(c.upright) && c.upright.length===3 && c.upright.every(Number.isFinite) &&
      Math.abs(Math.hypot(...c.upright)-1)<0.01 && Number.isFinite(c.tiltMax) && c.tiltMax>=6 && c.tiltMax<=60 &&
      [[c.flexNoise,Math.abs(c.flexSpan)],[c.forceNoise,c.forceSpan],[c.tiltNoise,c.tiltMax]]
        .every(([noise,span])=>Number.isFinite(noise) && noise>=0 && noise<span);
  }
  function migrateCalibration(old) {
    if (validCalibration(old)) return {...old};
    if (!old || ![old.flexRest,old.flexBent,old.forceRest,old.forceFull].every(adc)) return {...defaults};
    const migrated={...defaults,flexRest:old.flexRest,flexSpan:old.flexBent-old.flexRest,
      forceRest:old.forceRest,forceSpan:old.forceFull-old.forceRest,
      upright:old.upright??defaults.upright,tiltMax:old.tiltMax??defaults.tiltMax};
    return validCalibration(migrated)?migrated:{...defaults};
  }

  function percentile(values, fraction) {
    const sorted=[...values].sort((a,b)=>a-b);
    return sorted[Math.round((sorted.length-1)*fraction)];
  }
  function restLevel(values, span) {
    const rest=percentile(values,0.5);
    const radius=percentile(values.map(v=>Math.abs(v-rest)),0.95);
    const limit=Math.max(3,Math.min(10,Math.abs(span)*0.04));
    // Ignore isolated ADC spikes, but the final position must still be at rest.
    if (radius>limit || Math.abs(values.at(-1)-rest)>limit) return null;
    return {rest,noise:Math.min(radius+1,Math.abs(span)/3)};
  }

  // One transaction per click. Only the caller's subsequent, unique USB frames enter it.
  class RestWindow {
    constructor(started, enabled, calibration) {
      this.started=started;
      this.last=started;
      this.enabled={...enabled};
      this.previous=calibration;
      this.frames=[];
      this.firstSample=null;
      this.lastSample=-Infinity;
    }
    add(frame, time) {
      if (time-this.started>3500 || time-this.last>250) return {error:'USB readings were interrupted.'};
      this.last=time;
      if (time-this.started<300) return null;
      const en=this.enabled;
      if (en.touch && !frame.mpr) return {error:'The stem touch sensor is missing.'};
      if (en.touch && frame.touch) return {error:'Release the stem copper.'};
      if (en.tilt && !frame.imu) return {error:'The pot tilt sensor is missing.'};
      if (en.tilt && (Math.abs(Math.hypot(...frame.a)-16384)>2000 || Math.hypot(...frame.g)>900))
        return {error:'The pot moved. Set it down and let it settle.'};
      // Coalesced serial packets must not stand in for elapsed time at rest.
      if (time-this.lastSample<15) return null;
      this.lastSample=time;
      this.firstSample??=time;
      this.frames.push(frame);
      if (time-this.firstSample<1400 || this.frames.length<35) return null;
      const next={...this.previous};
      for (const [channel,adcKey,restKey,spanKey,noiseKey] of [
        ['flex','flex','flexRest','flexSpan','flexNoise'],
        ['pinch','fsr','forceRest','forceSpan','forceNoise']]) {
        if (!en[channel]) continue;
        const level=restLevel(this.frames.map(f=>f[adcKey]),next[spanKey]);
        if (!level) return {error:channel==='flex'?'The stem moved. Let it rest.':'Leaf pressure changed. Release the leaf.'};
        next[restKey]=level.rest;
        next[noiseKey]=level.noise;
      }
      if (en.tilt) {
        const directions=this.frames.map(f=>unit(f.a));
        const center=unit([0,1,2].map(i=>percentile(directions.map(v=>v[i]),0.5)));
        if (!center) return {error:'The pot changed position.'};
        const deviations=directions.map(v=>angle(center,v));
        if (Math.max(...deviations)>2.5) return {error:'The pot changed position.'};
        next.upright=center;
        next.tiltNoise=Math.max(1,percentile(deviations,0.95)+0.5);
      }
      return {calibration:next};
    }
  }

  function normalized(distance, span, noise) {
    return Math.max(0,Math.min(1,(distance-noise)/(span-noise)));
  }
  class Mapper {
    constructor(calibration=defaults) {this.calibration=migrateCalibration(calibration);this.reset();}
    reset() {this.flex=false;this.pinch=false;}
    update(frame) {
      const c=this.calibration;
      // Positive is extension in the saved wiring direction, negative is a tighter curl.
      const travel=frame.flex-c.flexRest;
      const headroom=travel<0?c.flexRest:1023-c.flexRest;
      const span=Math.max(12,c.flexNoise+4,Math.min(Math.abs(c.flexSpan),headroom));
      const magnitude=normalized(Math.abs(travel),span,c.flexNoise);
      const bend=magnitude===0?0:Math.sign(travel)*Math.sign(c.flexSpan)*magnitude;
      const force=normalized(frame.fsr-c.forceRest,c.forceSpan,c.forceNoise);
      // Different on/off thresholds prevent noise at rest from retriggering notes.
      // A long saved range should not require a large movement to begin a note.
      const trigger=this.flex?Math.min(4,0.05*span):Math.min(8,0.10*span);
      this.flex=Math.abs(travel)>=c.flexNoise+Math.max(2,trigger);
      this.pinch=force >= (this.pinch ? .035 : .07);
      const gravity=frame.imu?unit(frame.a):null;
      let tilt=0,degrees=0,motion=0;
      if(gravity && Math.hypot(...frame.a)>4096) {
        degrees=angle(c.upright,gravity);
        const n=c.upright,g=gravity;
        const cross=[n[1]*g[2]-n[2]*g[1],n[2]*g[0]-n[0]*g[2],n[0]*g[1]-n[1]*g[0]];
        const dominant=cross.reduce((best,x)=>Math.abs(x)>Math.abs(best)?x:best,0);
        tilt=normalized(degrees,c.tiltMax,c.tiltNoise)*(dominant<0?-1:1);
        motion=Math.min(1,Math.max(0,(Math.hypot(...frame.g)/131-5)/175));
      }
      return {bend,force,flex:this.flex,pinch:this.pinch,tilt,degrees,motion,touch:!!frame.touch,pot:!!frame.pot};
    }
  }
  const api={defaults,parse,Lines,Mapper,validCalibration,migrateCalibration,RestWindow,unit,angle};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PlantSensors=api;
})(typeof window==='undefined'?globalThis:window);
