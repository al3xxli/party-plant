const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const S=require('../interface/sensor-protocol.js');
const frame=(values={})=>({type:'plantband',v:2,seq:1,imu:true,a:[0,0,16384],g:[0,0,0],flex:275,fsr:0,touch:0,pot:0,mpr:true,...values});

test('serial framing survives every chunk boundary, CRLF, noise and oversized lines',()=>{
  const line=JSON.stringify(frame())+'\r\n';
  for(let split=0;split<=line.length;split++){
    const frames=[],lines=new S.Lines(f=>frames.push(f));
    lines.push(line.slice(0,split));lines.push(line.slice(split));
    assert.equal(frames.length,1);assert.equal(frames[0].flex,275);
  }
  const frames=[],lines=new S.Lines(f=>frames.push(f));
  lines.push('booting\n'+ 'x'.repeat(100000));assert(lines.buffer.length<=256);
  lines.push('\n'+line+line);assert.equal(frames.length,2);
  for(const overrides of [{v:3},{a:[40000,0,0]},{g:[0,0]},{imu:'true'},{flex:-1},{fsr:null},{touch:3},{mpr:'true'},{seq:1.1},{pot:true}])assert.equal(S.parse(JSON.stringify(frame(overrides))),null);
  assert.equal(S.parse('null'),null);
  assert.equal(S.parse(JSON.stringify(frame({mpr:false,touch:1,pot:1}))).touch,0);
});

test('tilt uses gravity in either direction and supports an arbitrary upright mounting',()=>{
  const m=new S.Mapper();
  let r=m.update(frame({a:[8192,0,14189],g:[13100,0,0],flex:430,fsr:800,touch:1,pot:1}));
  assert(r.flex&&r.pinch&&r.touch&&r.pot);assert(r.tilt>.999);assert(r.motion>.5);
  r=m.update(frame({a:[-8192,0,14189],flex:281,fsr:40}));assert(r.tilt<-.999);assert(r.flex&&r.pinch);
  r=m.update(frame());assert(!r.flex&&!r.pinch&&r.tilt===0);
  r=m.update(frame({flex:281,fsr:40}));assert(!r.flex&&!r.pinch);
  const sideways=new S.Mapper({...S.defaults,upright:[1,0,0]});
  assert.equal(sideways.update(frame({a:[16384,0,0]})).tilt,0);
  assert(Math.abs(sideways.update(frame({a:[14189,8192,0]})).tilt)>.99);
  assert.equal(m.update(frame({a:[0,0,0]})).tilt,0);
  assert.equal(m.update(frame({imu:false,a:[8192,0,14189]})).tilt,0);
  assert(!S.validCalibration({...S.defaults,flexBent:275}));
  assert(!S.validCalibration({...S.defaults,forceFull:0}));
  assert(!S.validCalibration({...S.defaults,upright:[0,0,0]}));
  assert(!S.validCalibration({...S.defaults,tiltMax:0}));
  const upgraded=S.migrateCalibration({flexRest:250,flexBent:410,forceRest:2,forceFull:900,soilDry:650,soilWet:320});
  assert.equal(upgraded.flexRest,250);assert.equal(upgraded.flexBent,410);assert.deepEqual(upgraded.upright,[0,0,1]);
  const legacy=S.parse(JSON.stringify({type:'plantband',v:1,seq:1,flex:375,fsr:0,soil:0,touch:0,pot:0,mpr:false}));
  assert(legacy&&!legacy.imu);assert.equal(m.update(legacy).tilt,0);
});

// Run the real browser controller, playroom and audio scheduler with a serial
// ReadableStream and deterministic clock. No USB device or browser is required.
function rig({holdLoad=false,protocol='http:',saved=null,savedMix=null,requestError=null,openError=null,unsupported=false,channels={flex:true,pinch:true,tilt:true,touch:true,pot:true}}={}){
  let now=0;
  const intervals=[],elements=new Map(),captures=[],switches=[];
  class Element extends EventTarget {
    constructor(id){super();this.id=id;this.style={};this.dataset={};this.hidden=false;this.disabled=false;this.textContent='';this.attributes={};this.value=0;this.classList={toggle(){}};}
    setAttribute(k,v){this.attributes[k]=v;}
    getAttribute(k){return this.attributes[k];}
    focus(){} setPointerCapture(){}
  }
  const element=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  for(const key of ['flexRest','flexBent','forceRest','forceFull','upright','tiltMax']){const el=new Element(key);el.dataset.capture=key;captures.push(el);}
  for(const key of ['flex','pinch','tilt','touch']){const el=new Element(key);el.dataset.channel=key;switches.push(el);}
  const document=new EventTarget();
  Object.assign(document,{hidden:false,activeElement:element('body'),body:element('body'),getElementById:element,
    querySelector:s=>element(s),querySelectorAll:s=>s==='[data-capture]'?captures:s==='[data-channel]'?switches:[]});
  // Keep real controller, serial stream and score lifecycle; record at the Ruby cue boundary.
  const score={runs:[],cues:new Map(),gain:0,stops:0,
    async run(demo,mix){this.runs.push({demo,mix:Array.from(mix)});},
    cue(name,values){this.cues.set(name,Array.from(values));},
    volume(value){this.gain=value;},
    stop(){this.gain=0;this.stops++;this.cues.clear();}};
  let finishLoad;
  const openPlantScore=async(ctx,visual)=>{
    score.visual=visual;
    if(holdLoad) await new Promise(resolve=>{finishLoad=resolve;});
    return score;
  };
  class AC {constructor(){this.state='running';}resume(){return Promise.resolve();}}
  class Port {
    async open(options){if(openError)throw openError;this.options=options;this.opened=true;this.readable=new ReadableStream({start:c=>this.controller=c,cancel:()=>this.cancelled=true});}
    async close(){assert(!this.readable?.locked,'stream lock must be released before closing');this.closed=true;}
    send(text){this.controller.enqueue(new TextEncoder().encode(text));}
  }
  const port=new Port(),serial=new EventTarget();
  serial.requestPort=async()=>{if(requestError)throw requestError;return port;};
  const window=new EventTarget(),store=new Map(saved?[["plantband.calibration.v2",JSON.stringify(saved)]]:[]);
  if(channels)store.set('plantband.channels.v2',JSON.stringify(channels));
  if(savedMix!==null)store.set('plantband.sonicmix.v1',savedMix);
  Object.assign(window,{document,console,Event,Map,Set,Symbol,TextDecoder,PlantSensors:S,AudioContext:AC,openPlantScore,location:{protocol},isSecureContext:true,
    navigator:unsupported?{}:{serial},performance:{now:()=>now},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    setInterval:(fn,period)=>{const timer={fn,period,next:now+period};intervals.push(timer);return timer;},clearInterval:t=>{t.off=true;},setTimeout:()=>{}});
  window.window=window;
  const context=vm.createContext(window);
  for(const file of ['audio.js','playroom.js','hardware.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../interface',file),'utf8'),context,{filename:file});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const advance=async ms=>{for(let end=now+ms;now<end;){now=Math.min(end,now+10);for(const t of intervals)if(!t.off&&now>=t.next){t.next=now+t.period;t.fn();}await flush();}};
  return {window,port,serial,element,captures,switches,store,score,finishLoad:()=>finishLoad(),flush,advance,
    state:()=>vm.runInContext('({...band.state})',context),
    click:id=>element(id).onclick(),
    send:async values=>{port.send(JSON.stringify(frame(values))+'\n');await flush();},
    connected:()=>window.plantHardware.connected,
    run:code=>vm.runInContext(code,context)};
}

test('USB frames drive all four Sonic Pi cues; Stop, stale stream, recovery and disconnect release sound',async()=>{
  const r=rig();await r.click('connect');assert(r.connected());assert.equal(r.port.options.baudRate,115200);
  assert(r.element('tilt').disabled&&r.element('ensemble').disabled);
  for(let seq=1;seq<=9;seq++){await r.send({seq,a:[8192,0,14189],flex:430,fsr:800,touch:1,pot:1});await r.advance(100);}
  let s=r.state();assert(s.lead&&s.pinching&&s.chime&&s.tilt>.999);
  for(const name of ['bend','pinch','tilt','touch'])assert(r.score.cues.get(name)[0]>0,name);
  assert(r.score.gain>0);
  assert.equal(r.element('touch').getAttribute('aria-pressed'),'true');
  assert.equal(r.run("manual()"),false,'virtual input must not overwrite physical readings');
  r.click('stop');await r.send({seq:10,flex:430,fsr:800,touch:1,pot:1,a:[8192,0,14189]});
  s=r.state();assert(!s.lead&&!s.pinching&&!s.chime&&s.tilt===0);assert(!r.element('resume').hidden);
  assert.equal(r.element('touch').getAttribute('aria-pressed'),'false');
  r.click('resume');assert(r.state().lead);
  // A repeated sequence is not a new reading.
  await r.advance(600);await r.send({seq:10,flex:430});await r.advance(600);
  assert.equal(r.state().lead,false);assert.match(r.element('connection-status').textContent,/stopped/);
  await r.send({seq:11,flex:430,touch:1});assert(!r.state().lead,'recovered stream stays paused');
  r.click('resume');assert(r.state().lead);
  await r.send({seq:12,mpr:false,touch:1,pot:1,flex:430});
  assert(r.state().lead&&!r.state().chime);assert.match(r.element('connection-status').textContent,/missing/);
  assert.equal(r.element('stem-contact').textContent,'Touch the stem');
  await r.click('connect');assert(!r.connected());assert(r.port.closed&&r.port.cancelled);
  assert(!r.element('tilt').disabled);assert.equal(r.score.gain,0);
  await r.click('connect');await r.send({seq:0,flex:430});assert(r.state().lead);
  r.port.controller.error(new Error('USB removed'));await r.flush();await r.flush();
  assert(!r.connected());assert(!r.state().lead);assert.match(r.element('connection-status').textContent,/disconnected/);
});

test('permission cancellation, busy port, missing sketch and unsupported browsers are recoverable',async()=>{
  for(const settings of [{requestError:Object.assign(new Error(),{name:'NotFoundError'})},{openError:new Error('busy')},{unsupported:true}]){
    const r=rig(settings);await r.click('connect');assert(!r.connected());assert(!r.element('connect').disabled);assert(r.element('connection-status').textContent.length>0);
  }
  const r=rig();await r.click('connect');r.port.send('old firmware\n');await r.advance(5300);
  assert.match(r.element('connection-status').textContent,/Upload/);assert(!r.state().lead);
  await r.click('connect');assert(r.port.closed);
});

test('calibration capture, persistence, stale guard and focus pause use live data',async()=>{
  const r=rig({saved:{...S.defaults,flexRest:'bad'}});await r.click('connect');await r.send({seq:1,flex:720});
  r.captures.find(e=>e.dataset.capture==='flexRest').onclick();
  assert.equal(JSON.parse(r.store.get('plantband.calibration.v2')).flexRest,720);
  await r.send({seq:2,flex:710});r.captures.find(e=>e.dataset.capture==='flexBent').onclick();
  assert.match(r.element('calibration-status').textContent,/too close/);
  await r.send({seq:3,flex:400});r.captures.find(e=>e.dataset.capture==='flexBent').onclick();
  assert.equal(JSON.parse(r.store.get('plantband.calibration.v2')).flexBent,400);
  r.window.dispatchEvent(new Event('blur'));assert.equal(r.state().lead,false);
  await r.send({seq:4,flex:400});assert(!r.state().lead);r.click('resume');assert(r.state().lead);
  await r.advance(1300);assert(r.captures.every(e=>e.disabled));
  const previous=r.store.get('plantband.calibration.v2');r.captures[0].onclick();assert.equal(r.store.get('plantband.calibration.v2'),previous);
  r.click('reset-calibration');assert.equal(JSON.parse(r.store.get('plantband.calibration.v2')).flexRest,275);await r.click('connect');
});

test('flex-only startup silences floating unused inputs; new channels can join independently',async()=>{
  const r=rig({channels:null});await r.click('connect');
  await r.send({seq:1,flex:375,fsr:1000,a:[8192,0,14189],touch:1,pot:1});await r.advance(800);
  let s=r.state();assert(s.lead&&!s.pinching&&!s.chime&&s.tilt===0);
  const tilt=r.switches.find(el=>el.dataset.channel==='tilt');tilt.checked=true;tilt.onchange();
  assert(r.state().tilt>.999);tilt.checked=false;tilt.onchange();assert.equal(r.state().tilt,0);
  await r.send({seq:2,flex:275});assert(!r.state().lead);
  assert.equal(JSON.parse(r.store.get('plantband.channels.v2')).tilt,false);await r.click('connect');
});

test('MPU loss silences only tilt, and upright calibration rejects missing or moving sensors',async()=>{
  const r=rig();await r.click('connect');
  await r.send({seq:1,a:[8192,0,14189],flex:375});await r.advance(200);
  assert(r.state().tilt>.999&&r.state().lead);
  await r.send({seq:2,imu:false,a:[8192,0,14189],flex:375});await r.advance(200);
  assert(r.state().tilt===0&&r.state().lead);assert(!r.run('band.bassPlaying'));
  assert(r.captures.find(el=>el.dataset.capture==='upright').disabled);
  await r.send({seq:3,a:[16384,0,0]});
  r.captures.find(el=>el.dataset.capture==='upright').onclick();
  assert.deepEqual(JSON.parse(r.store.get('plantband.calibration.v2')).upright,[1,0,0]);
  await r.send({seq:4,a:[14189,8192,0]});
  r.captures.find(el=>el.dataset.capture==='tiltMax').onclick();
  assert(Math.abs(JSON.parse(r.store.get('plantband.calibration.v2')).tiltMax-30)<.01);
  await r.send({seq:5,g:[2000,0,0]});
  r.captures.find(el=>el.dataset.capture==='upright').onclick();
  assert.match(r.element('calibration-status').textContent,/Hold the pot still/);
  await r.click('connect');
});


test('Ruby mix and master controls preserve gestures and calibration',async()=>{
  const calibration={...S.defaults,flexRest:993,flexBent:375};
  const r=rig({saved:calibration,savedMix:'{"keys":0.7,"pad":0,"drums":1}'});
  await r.click('connect');await r.send({flex:375,fsr:800,touch:1,a:[8192,0,14189]});
  assert.deepEqual(r.score.cues.get('mix'),[.7,0,1]);
  r.element('mix-drums').value=25;r.element('mix-drums').oninput();
  assert.deepEqual(r.score.cues.get('mix'),[.7,0,.25]);assert(r.state().chime&&r.state().pinching);
  assert.equal(JSON.parse(r.store.get('plantband.sonicmix.v1')).drums,.25);
  r.click('mute');assert.equal(r.score.gain,0);r.click('mute');assert(r.score.gain>0);
  r.click('reset-mix');assert.deepEqual(r.score.cues.get('mix'),[1,1,1]);
  assert.deepEqual(JSON.parse(r.store.get('plantband.calibration.v2')),calibration);
  await r.click('connect');
});

test('gyro tilt, pinch strength, bend and touch stay independent on one score clock',async()=>{
  const r=rig();await r.click('connect');await r.send({seq:1,flex:375,fsr:800,touch:1,a:[8192,0,14189]});
  const count=r.score.runs.length;
  await r.send({seq:2,flex:325,fsr:400,touch:0,g:[13000,0,0]});
  assert.equal(r.score.runs.length,count);
  assert.equal(r.score.cues.get('touch')[0],0);assert.equal(r.score.cues.get('tilt')[0],0);
  assert.equal(r.score.cues.get('bend')[0],.5);assert.equal(r.score.cues.get('pinch')[0],.5);
  await r.click('connect');
});

test('Stop during a cold load cannot start the delayed score',async()=>{
  const r=rig({holdLoad:true});
  r.click('ensemble');r.click('stop');r.finishLoad();await r.flush();
  assert.equal(r.score.runs.length,0);assert.equal(r.score.gain,0);
  r.click('ensemble');await r.flush();assert.equal(r.score.runs.at(-1).demo,true);
  r.score.visual(.6,.8,.7,1);assert(r.state().lead&&r.state().chime&&r.state().pinching);
  assert.equal(r.score.cues.has('touch'),false,'visual events must not override the Ruby self-play');
  r.click('stop');r.score.visual(.9,1,1,1);assert(!r.state().chime);assert.equal(r.score.gain,0);
});

test('a file URL explains how to launch the score',async()=>{
  const r=rig({protocol:'file:'});
  r.click('ensemble');await r.flush();assert.equal(r.score.runs.length,0);
  assert.match(r.element('error').textContent,/localhost or HTTPS/);
});

test('stem feedback follows E0 edges even between UI refreshes; legacy pot input is ignored',async()=>{
  const r=rig();await r.click('connect');
  await r.send({seq:1,pot:1});await r.advance(800);
  assert.equal(r.score.cues.get('touch')[0],0);
  await r.send({seq:2,touch:1,pot:1});
  assert.equal(r.element('stem-contact').textContent,'Stem touched');
  assert.equal(r.element('touch').getAttribute('aria-pressed'),'true');
  await r.send({seq:3,touch:0,pot:1});
  assert.equal(r.element('stem-contact').textContent,'Touch the stem');
  assert.equal(r.element('touch').getAttribute('aria-pressed'),'false');
  await r.send({seq:4,touch:1});
  await r.click('connect');
  assert.equal(r.element('touch').getAttribute('aria-pressed'),'false');
});
