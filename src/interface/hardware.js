/* USB readings stay on this laptop. The browser owns all five audio voices. */
window.plantHardware = (() => {
  'use strict';
  const button=$('connect'),status=$('connection-status'),resume=$('resume');
  const storageKey='plantband.calibration.v2';
  const channelKey='plantband.channels.v2';
  const enabled={flex:true,pinch:false,tilt:false,touch:false,pot:false};
  try {
    const config=JSON.parse(localStorage.getItem(channelKey));
    if(config && Object.keys(enabled).every(key=>typeof config[key]==='boolean'))Object.assign(enabled,config);
    else {
      const old=JSON.parse(localStorage.getItem('plantband.channels.v1'));
      if(old)for(const key of ['flex','pinch','touch','pot'])if(typeof old[key]==='boolean')enabled[key]=old[key];
    }
  }catch {}
  let saved;
  try {
    saved=JSON.parse(localStorage.getItem(storageKey));
    if(!PlantSensors.validCalibration(saved))saved=PlantSensors.migrateCalibration(JSON.parse(localStorage.getItem('plantband.calibration.v1')));
  }catch {}
  const mapper=new PlantSensors.Mapper(PlantSensors.validCalibration(saved)?saved:PlantSensors.defaults);
  let session=null,busy=false,paused=false,latest=null,lastFrame=0,lastUI=0,stale=false;
  const fields={flexRest:'flex',flexBent:'flex',forceRest:'fsr',forceFull:'fsr'};
  const fresh=()=>latest && performance.now()-lastFrame<1000;
  function message(text) {if(status.textContent!==text)status.textContent=text;}
  function silence() {mapper.reset();band.stop();setTilt(0);}
  function controls(connected) {
    document.body.classList.toggle('hardware',connected);
    for(const id of ['ensemble','pinch','touch','pot','tilt'])$(id).disabled=connected;
    $('flex').setAttribute('aria-disabled',String(connected));
    $('sensor-setup').hidden=!connected;
    button.textContent=connected?'Disconnect':'Connect Arduino';
    resume.hidden=!connected||!paused;
    for(const el of document.querySelectorAll('[data-capture]'))el.disabled=!fresh();
  }
  function report() {
    if(!session)return;
    if(!latest)message('Waiting for the Plant Band sketch…');
    else if(stale)message('Readings stopped. Check the USB cable or sketch.');
    else if(enabled.tilt&&latest.v<2)message('Upload the updated sketch for pot tilt.');
    else if(enabled.tilt&&!latest.imu)message(paused?'Paused · MPU6050 missing':'Live · MPU6050 missing; check its wiring.');
    else if(!latest.mpr && (enabled.touch||enabled.pot))message(paused?'Paused · touch sensor missing':'Live · touch sensor missing; check MPR121 wiring.');
    else message(paused?'Paused':'Live');
    resume.hidden=!session||!paused;
    resume.disabled=!fresh();
  }
  function apply(frame) {
    const input=mapper.update(frame);
    setTilt(enabled.tilt?input.tilt:0,enabled.tilt?input.motion:0);
    band.setLead(enabled.flex&&input.flex,enabled.flex&&input.flex?input.bend:0);
    band.setPinch(enabled.pinch&&input.pinch,input.force);
    band.setChime(enabled.touch&&input.touch);band.setPot(enabled.pot&&input.pot);
  }
  function receive(frame,owner) {
    if(session!==owner||owner.closing)return;
    // Repeated packets must not keep a frozen sensor stream sounding forever.
    if(latest?.seq===frame.seq)return;
    latest=frame;lastFrame=performance.now();stale=false;
    if(!paused && !document.hidden)apply(frame);
    if(lastFrame-lastUI>100) {
      lastUI=lastFrame;
      for(const field of ['flex','fsr'])$('raw-'+field).textContent=frame[field];
      const pose=frame.imu?PlantSensors.unit(frame.a):null;
      $('raw-tilt').textContent=pose?Math.round(PlantSensors.angle(mapper.calibration.upright,pose))+'°':'—';
      $('motion-readings').textContent=frame.v<2?'Upload the updated sketch to use MPU6050.':frame.imu?'MPU6050 connected. Set upright with the pot still.':'MPU6050 not detected. Check VIN, GND, A4/SDA and A5/SCL.';
      $('touch-readings').textContent=frame.mpr?`Stem: ${frame.touch?'touched':'released'} · Pot: ${frame.pot?'touched':'released'}`:'MPR121 not detected. Check power, A4/A5 and address 0x5A.';
      for(const el of document.querySelectorAll('[data-capture]'))el.disabled=['upright','tiltMax'].includes(el.dataset.capture)&&!frame.imu;
    }
    report();
  }
  async function read(owner) {
    const lines=new PlantSensors.Lines(frame=>receive(frame,owner));
    const decoder=new TextDecoder();
    try {
      owner.reader=owner.port.readable.getReader();
      while(!owner.closing) {
        const {value,done}=await owner.reader.read();
        if(done)break;
        if(value)lines.push(decoder.decode(value,{stream:true}));
      }
    } catch {owner.failed=true;}
    finally {
      owner.reader?.releaseLock();owner.reader=null;
      if(!owner.closing)void disconnect('Arduino disconnected. Connect again to play.');
    }
  }
  async function disconnect(text='Disconnected') {
    const owner=session;
    if(!owner||owner.closing)return;
    owner.closing=true;busy=true;button.disabled=true;
    silence();
    try {
      await owner.reader?.cancel().catch(()=>{});
      await owner.task;
      await owner.port.close().catch(()=>{});
    } finally {
      if(session===owner)session=null;
      latest=null;paused=false;busy=false;stale=false;
      controls(false);button.disabled=false;message(text);
    }
  }
  async function connect() {
    if(busy)return;
    if(session) {await disconnect();return;}
    if(!window.isSecureContext || !navigator.serial) {
      message('For USB, open this page in desktop Chrome or Edge using HTTPS or localhost.');return;
    }
    if(!band.activate())return; // A user click unlocks laptop sound before the chooser opens.
    busy=true;button.disabled=true;message('Choose your Arduino.');
    let port,opened=false;
    try {
      const remembered=await navigator.serial.getPorts?.() || [];
      const unos=remembered.filter(candidate=>{
        const info=candidate.getInfo();
        return [0x2341,0x2A03].includes(info.usbVendorId) && [0x0043,0x0001].includes(info.usbProductId);
      });
      port=unos.length===1?unos[0]:await navigator.serial.requestPort();
      await port.open({baudRate:115200});opened=true;
      if(!port.readable)throw new Error('No readable port');
      stopAll(); // Release every demo/keyboard/pointer voice before taking ownership.
      latest=null;lastFrame=performance.now();stale=false;paused=false;
      const owner={port,reader:null,closing:false};session=owner;
      controls(true);report();
      owner.task=read(owner);
    } catch(error) {
      if(opened)await port.close().catch(()=>{});
      message(error.name==='NotFoundError'?'No board selected.':error.name==='SecurityError'?'USB access is blocked here. Open this page directly in desktop Chrome or Edge.':'Could not open Arduino. Close Serial Monitor and other apps using the port, then try again.');
    } finally {busy=false;button.disabled=false;}
  }
  function pause() {
    if(!session)return;
    paused=true;silence();report();
  }
  button.onclick=connect;
  for(const el of document.querySelectorAll('[data-channel]')) {
    el.checked=enabled[el.dataset.channel];
    el.onchange=()=>{
      enabled[el.dataset.channel]=el.checked;
      try {localStorage.setItem(channelKey,JSON.stringify(enabled));}catch {}
      mapper.reset();
      if(session&&!paused&&fresh())apply(latest);
      report();
    };
  }
  resume.onclick=()=>{
    if(!session||!fresh()||!band.activate())return;
    paused=false;mapper.reset();apply(latest);report();
  };
  for(const el of document.querySelectorAll('[data-capture]')) {
    el.onclick=()=>{
      if(!fresh())return;
      const key=el.dataset.capture;
      const next={...mapper.calibration};
      if(key==='upright'||key==='tiltMax') {
        if(!PlantSensors.stablePose(latest)) {
          $('calibration-status').textContent='Hold the pot still with MPU6050 connected, then save its position.';return;
        }
        if(key==='upright')next.upright=PlantSensors.unit(latest.a);
        else next.tiltMax=PlantSensors.angle(next.upright,PlantSensors.unit(latest.a));
      } else next[key]=latest[fields[key]];
      if(!PlantSensors.validCalibration(next)) {
        $('calibration-status').textContent='Those positions are too close or reversed. For the pot, choose a gentle tilt between 6° and 60°.';return;
      }
      mapper.calibration=next;mapper.reset();
      try {localStorage.setItem(storageKey,JSON.stringify(next));$('calibration-status').textContent='Saved. '+calibrationText();}
      catch {$('calibration-status').textContent='Saved for this session. This browser could not save settings for next time.';}
    };
  }
  function calibrationText() {
    const c=mapper.calibration;
    return `Bend ${c.flexRest} → ${c.flexBent}. Pinch ${c.forceRest} → ${c.forceFull}. Full tilt ${Math.round(c.tiltMax)}°.`;
  }
  $('reset-calibration').onclick=()=>{
    mapper.calibration={...PlantSensors.defaults};mapper.reset();
    try {localStorage.setItem(storageKey,JSON.stringify(mapper.calibration));}catch {}
    $('calibration-status').textContent='Defaults restored. '+calibrationText();
  };
  if(PlantSensors.validCalibration(saved))$('calibration-status').textContent='Using saved settings. '+calibrationText();
  setInterval(()=>{
    if(!session||session.closing)return;
    const timeout=latest?1000:5000;
    if(performance.now()-lastFrame>timeout && !stale) {
      stale=true;paused=true;silence();
      for(const el of document.querySelectorAll('[data-capture]'))el.disabled=true;
      if(!latest)message('No Plant Band readings. Upload the USB sketch, then reconnect.');
      else report();
    }
    resume.disabled=!fresh();
  },200);
  navigator.serial?.addEventListener('disconnect',event=>{
    if(session && (event.target===session.port || event.port===session.port))void disconnect('Arduino unplugged. Connect again to play.');
  });
  return {get connected(){return !!session;},pause};
})();
