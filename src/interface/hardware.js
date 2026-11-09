/* USB readings stay on this laptop. The browser owns Sonic Pi score. */
window.plantHardware = (() => {
  'use strict';
  const button=$('connect'),status=$('connection-status'),resume=$('resume');
  const storageKey='plantband.calibration.v3';
  const channelKey='plantband.channels.v2';
  const enabled={flex:true,pinch:false,tilt:false,touch:false};
  try {
    const config=JSON.parse(localStorage.getItem(channelKey));
    if(config && Object.keys(enabled).every(key=>typeof config[key]==='boolean')) {
      for(const key of Object.keys(enabled))enabled[key]=config[key];
    }
    else {
      const old=JSON.parse(localStorage.getItem('plantband.channels.v1'));
      if(old)for(const key of ['flex','pinch','touch'])if(typeof old[key]==='boolean')enabled[key]=old[key];
    }
  }catch {}
  function stored(key) {
    try {return JSON.parse(localStorage.getItem(key));} catch {return null;}
  }
  const saved=stored(storageKey);
  const calibration=PlantSensors.validCalibration(saved)?saved:
    PlantSensors.migrateCalibration(stored('plantband.calibration.v2')??stored('plantband.calibration.v1'));
  const mapper=new PlantSensors.Mapper(calibration);
  const zero=$('zero-sensors'),feedback=$('zero-status');
  const ranges=Array.from(document.querySelectorAll('[data-range]'));
  const switches=Array.from(document.querySelectorAll('[data-channel]'));
  const restHint='Let the stem rest, release the leaf and copper, and set the pot down.';
  let session=null,busy=false,paused=false,latest=null,lastFrame=0,lastUI=0,stale=false;
  let zeroing=null;
  const fresh=()=>latest && performance.now()-lastFrame<1000;
  function zeroControls() {
    zero.disabled=!session || session.closing || !fresh() || !!zeroing || !Object.values(enabled).some(Boolean);
    zero.textContent=zeroing?'Measuring…':'Zero sensors';
    for(const el of [...ranges,...switches])el.disabled=!!zeroing;
  }
  function saveCalibration(next,success) {
    mapper.calibration=next; mapper.reset();
    try {localStorage.setItem(storageKey,JSON.stringify(next));feedback.textContent=success;}
    catch {feedback.textContent=success+' Saved for this session only.';}
  }
  function cancelZero(reason) {
    if (!zeroing) return;
    zeroing=null;
    band.setCalibrationQuiet(false);
    feedback.textContent=reason+' Previous calibration kept.';
    zeroControls();
  }
  function sampleZero(frame,time) {
    const result=zeroing.add(frame,time);
    if (!result) return;
    if (result.error) {
      cancelZero(result.error+' Try Zero sensors again.');
      return;
    }
    zeroing=null;
    saveCalibration(result.calibration,'Zeroed. The current resting position is silent.');
    band.setCalibrationQuiet(false);
    zeroControls();
  }
  function message(text) {if(status.textContent!==text)status.textContent=text;}
  function silence() {mapper.reset();band.stop();setTilt(0);}
  function controls(connected) {
    document.body.classList.toggle('hardware',connected);
    for(const id of ['ensemble','pinch','touch','tilt'])$(id).disabled=connected;
    $('flex').setAttribute('aria-disabled',String(connected));
    $('sensor-setup').hidden=!connected;
    button.textContent=connected?'Disconnect':'Connect Arduino';
    resume.hidden=!connected||!paused;
    zero.hidden=feedback.hidden=!connected;
    zeroControls();
  }
  function report() {
    if(!session)return;
    if(!latest)message('Waiting for the Plant Band sketch…');
    else if(zeroing)message('Zeroing sensors…');
    else if(stale)message('Readings stopped. Check the USB cable or sketch.');
    else if(enabled.tilt&&latest.v<2)message('Upload the updated sketch for pot tilt.');
    else if(enabled.tilt&&!latest.imu)message(paused?'Paused · MPU6050 missing':'Live · MPU6050 missing; check its wiring.');
    else if(!latest.mpr && enabled.touch)message(paused?'Paused · touch sensor missing':'Live · touch sensor missing; check MPR121 wiring.');
    else if(!paused && !enabled.pinch && !enabled.tilt && !enabled.touch)
      message('Enable Pinch, Pot tilt or Stem touch in Sensor setup to hear sound.');
    else message(paused?'Paused':'Live');
    resume.hidden=!session||!paused||!!zeroing;
    resume.disabled=!fresh();
  }
  function apply(frame) {
    const input=mapper.update(frame);
    setTilt(enabled.tilt?input.tilt:0,enabled.tilt?input.motion:0);
    band.setLead(enabled.flex&&input.flex,enabled.flex&&input.flex?input.bend:0);
    band.setPinch(enabled.pinch&&input.pinch,input.force);
    band.setChime(enabled.touch&&input.touch);
  }
  function receive(frame,owner) {
    if(session!==owner||owner.closing)return;
    // Reject repeated packets. A sequence gap during zeroing cannot bridge an outage.
    if(latest?.seq===frame.seq)return;
    if(zeroing && latest && ((frame.seq-latest.seq)>>>0)>10) {
      cancelZero('The USB stream skipped readings.');
    }
    latest=frame;lastFrame=performance.now();stale=false;
    if(zeroing)sampleZero(frame,lastFrame);
    if(!zeroing && !paused && !document.hidden)apply(frame);
    if(lastFrame-lastUI>100) {
      lastUI=lastFrame;
      for(const field of ['flex','fsr'])$('raw-'+field).textContent=frame[field];
      const pose=frame.imu?PlantSensors.unit(frame.a):null;
      $('raw-tilt').textContent=pose?Math.round(PlantSensors.angle(mapper.calibration.upright,pose))+'°':'—';
      $('motion-readings').textContent=frame.v<2?'Upload the updated sketch to use MPU6050.':frame.imu?'MPU6050 connected.':'MPU6050 not detected. Check VIN, GND, A4/SDA and A5/SCL.';
      $('touch-readings').textContent=frame.mpr?(frame.touch?'Stem touched (E0).':'Stem released (E0).'):'MPR121 not detected. Check power, A4/A5 and address 0x5A.';
      zeroControls();
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
    cancelZero('Arduino disconnected.');
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
    if(!band.unlock())return; // Keep the click's audio permission while the port chooser is open.
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
      $('touch-readings').textContent='Waiting for stem touch.';
      const owner={port,reader:null,closing:false};session=owner;
      feedback.textContent=restHint;
      controls(true);report();
      if(!band.activate())pause();
      owner.task=read(owner);
    } catch(error) {
      if(opened)await port.close().catch(()=>{});
      message(error.name==='NotFoundError'?'No board selected.':error.name==='SecurityError'?'USB access is blocked here. Open this page directly in desktop Chrome or Edge.':'Could not open Arduino. Close Serial Monitor and other apps using the port, then try again.');
    } finally {busy=false;button.disabled=false;}
  }
  function pause(reason='Zeroing cancelled.') {
    if(!session)return;
    paused=true;silence();cancelZero(reason);report();
  }
  // A Ruby or browser audio error must also expose the hardware Resume button.
  window.addEventListener('plantbanderror',()=>pause('Audio interrupted.'));
  button.onclick=connect;
  for(const el of switches) {
    el.checked=enabled[el.dataset.channel];
    el.onchange=()=>{
      if(zeroing)return;
      enabled[el.dataset.channel]=el.checked;
      zeroControls();
      try {localStorage.setItem(channelKey,JSON.stringify(enabled));}catch {}
      mapper.reset();
      if(session&&!paused&&fresh())apply(latest);
      report();
    };
  }
  resume.onclick=()=>{
    if(!session||zeroing||!fresh()||!band.activate())return;
    paused=false;mapper.reset();apply(latest);report();
  };
  zero.onclick=()=>{
    zeroControls();
    if(zero.disabled)return;
    if(!paused && !band.unlock())return;
    zeroing=new PlantSensors.RestWindow(performance.now(),enabled,mapper.calibration);
    // Calibration is a temporary mute. Keep the Ruby job, cue listeners and clock alive.
    band.setCalibrationQuiet(true);
    mapper.reset();setTilt(0);band.setLead(false,0);band.setPinch(false,0);band.setChime(false);
    feedback.textContent='Hold still for two seconds. Keep hands off the leaf and copper.';
    zeroControls();report();
  };
  for (const el of ranges) {
    const key=el.dataset.range;
    el.value=mapper.calibration[key];
    el.onchange=()=>{
      if(zeroing)return;
      const next={...mapper.calibration,[key]:Number(el.value)};
      if(!PlantSensors.validCalibration(next)) {
        el.value=mapper.calibration[key];
        feedback.textContent='Use a bend travel of ±12–1023 counts, pinch travel of 12–1023 counts, or tilt of 6–60°.';
        return;
      }
      saveCalibration(next,'Playing range saved.');
      if(session&&!paused&&fresh())apply(latest);
    };
  }
  setInterval(()=>{
    if(!session||session.closing)return;
    const timeout=latest?1000:5000;
    if(performance.now()-lastFrame>timeout && !stale) {
      stale=true;paused=true;silence();
      $('touch-readings').textContent='Waiting for stem readings.';
      cancelZero('USB readings stopped.');
      if(!latest)message('No Plant Band readings. Upload the USB sketch, then reconnect.');
      else report();
    }
    if(zeroing && (performance.now()-zeroing.started>3500 || performance.now()-lastFrame>250)) {
      cancelZero('Too few fresh USB readings.');report();
    }
    zeroControls();
    resume.disabled=!fresh();
  },200);
  navigator.serial?.addEventListener('disconnect',event=>{
    if(session && (event.target===session.port || event.port===session.port))void disconnect('Arduino unplugged. Connect again to play.');
  });
  return {get connected(){return !!session;},pause};
})();
