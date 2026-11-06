/* Shared serial contract. Pure functions also run in Node for transport tests. */
(function(root) {
  'use strict';
  // Flex endpoints measured on this plant. Recalibrate after mounting changes.
  // Set upright again after fastening the MPU6050 to the pot.
  const defaults = Object.freeze({flexRest:275, flexBent:375, forceRest:0, forceFull:800, upright:[0,0,1], tiltMax:30});
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
    return c && ['flexRest','flexBent','forceRest','forceFull'].every(k=>adc(c[k])) &&
      Math.abs(c.flexRest-c.flexBent)>=12 && c.forceFull-c.forceRest>=12 &&
      Array.isArray(c.upright)&&c.upright.length===3&&c.upright.every(Number.isFinite)&&
      Math.abs(Math.hypot(...c.upright)-1)<.01 && Number.isFinite(c.tiltMax)&&c.tiltMax>=6&&c.tiltMax<=60;
  }
  function migrateCalibration(old) {
    const c={...defaults};
    if(old)for(const k of ['flexRest','flexBent','forceRest','forceFull'])c[k]=old[k];
    return validCalibration(c)?c:{...defaults};
  }
  function stablePose(f) {return f.imu&&Math.hypot(...f.a)>12000&&Math.hypot(...f.a)<21000&&Math.hypot(...f.g)<1310;}
  function normalized(raw,from,to) { return Math.max(0,Math.min(1,(raw-from)/(to-from))); }
  class Mapper {
    constructor(calibration=defaults) {this.calibration={...calibration};this.reset();}
    reset() {this.flex=false;this.pinch=false;}
    update(frame) {
      const c=this.calibration;
      const bend=normalized(frame.flex,c.flexRest,c.flexBent),force=normalized(frame.fsr,c.forceRest,c.forceFull);
      // Different on/off thresholds prevent noise at rest from retriggering notes.
      this.flex=bend >= (this.flex ? .05 : .10);
      this.pinch=force >= (this.pinch ? .035 : .07);
      const gravity=frame.imu?unit(frame.a):null;
      let tilt=0,degrees=0,motion=0;
      if(gravity && Math.hypot(...frame.a)>4096) {
        degrees=angle(c.upright,gravity);
        const n=c.upright,g=gravity;
        const cross=[n[1]*g[2]-n[2]*g[1],n[2]*g[0]-n[0]*g[2],n[0]*g[1]-n[1]*g[0]];
        const dominant=cross.reduce((best,x)=>Math.abs(x)>Math.abs(best)?x:best,0);
        tilt=Math.min(1,degrees/c.tiltMax)*(dominant<0?-1:1);
        motion=Math.min(1,Math.max(0,(Math.hypot(...frame.g)/131-5)/175));
      }
      return {bend,force,flex:this.flex,pinch:this.pinch,tilt,degrees,motion,touch:!!frame.touch,pot:!!frame.pot};
    }
  }
  const api={defaults,parse,Lines,Mapper,validCalibration,migrateCalibration,stablePose,unit,angle};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PlantSensors=api;
})(typeof window==='undefined'?globalThis:window);
