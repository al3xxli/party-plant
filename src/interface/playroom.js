const $ = id => document.getElementById(id);
const clip = value => Math.max(0, Math.min(1, value));
const hands = {flex:new Map(), pinch:new Map(), touch:new Set(), tilt:new Map()};
const keys = new Map();
let playingDemo=false, scoreTimer, oldTilt=0;

function setTilt(value,motion=0) {
  band.state.tilt=Math.max(-1,Math.min(1,value));
  band.state.motion=clip(motion);
  $('tilt').value=Math.round(band.state.tilt*100);
}
function clearHands() {
  Object.values(hands).forEach(group=>group.clear());
  band.setPinch(false);band.setLead(false,0);band.setChime(false);
}
function stopScore(restore=true) {
  if (!playingDemo) return;
  clearInterval(scoreTimer);playingDemo=false;band.stop();
  setTilt(restore?oldTilt:0);
  $('ensemble').setAttribute('aria-pressed','false');
  $('ensemble-text').textContent='Play demo';
}
function manual() {
  if (window.plantHardware?.connected) return false;
  stopScore();
  return band.activate();
}
function touchStem(on,id) {
  if (on) {if (!manual()) return;hands.touch.add(id);}
  else if (!hands.touch.delete(id)) return;
  band.setChime(hands.touch.size>0);
}
function tiltPot(on,id,amount=0) {
  if(on) {
    if(!hands.tilt.has(id)&&!manual())return;
    hands.tilt.delete(id);hands.tilt.set(id,Math.max(-1,Math.min(1,amount)));
  } else if(!hands.tilt.delete(id))return;
  setTilt([...hands.tilt.values()].pop()??0);
}
function flexStem(on,id,amount) {
  if (on) {
    if (!hands.flex.has(id) && !manual()) return;
    hands.flex.delete(id);hands.flex.set(id,clip(amount));
  } else if (!hands.flex.delete(id)) return;
  const last=[...hands.flex.values()].pop();
  band.setLead(last!==undefined,last??0);
}
function pinchLeaf(on,id,pressure) {
  if (on) {
    if (!hands.pinch.has(id) && !manual()) return;
    hands.pinch.set(id,clip(pressure));
  } else if (!hands.pinch.delete(id)) return;
  band.setPinch(hands.pinch.size>0,Math.max(0,...hands.pinch.values()));
}
function stopAll() {
  window.plantHardware?.pause();
  stopScore(false);keys.clear();clearHands();band.stop();setTilt(0);
  window.dispatchEvent(new Event('plantbandstop'));
}
function runScore() {
  if (window.plantHardware?.connected) return;
  if (playingDemo) {stopScore();return;}
  if (!band.activate()) return;
  oldTilt=band.state.tilt;clearHands();band.stop();
  window.dispatchEvent(new Event('plantbandstop'));
  playingDemo=true;
  $('ensemble').setAttribute('aria-pressed','true');
  $('ensemble-text').textContent='Stop demo';
  const melody=[0,.12,.29,.5,.29,.12,0,0,.29,.5,.66,.5,.29,.12,0,0];
  let step=0;
  function next() {
    if(step===melody.length) {stopScore();return;}
    const i=step++;
    setTilt((i%8<4?-1:1)*(i<8?.58:.83),.35);
    band.setPinch(i<14,i%4===0?.85:.48);
    band.setChime(i>=2 && i<15);
    band.setLead(i>=3 && i<15,melody[i]);
  }
  next();scoreTimer=setInterval(next,300);
}
$('ensemble').onclick=runScore;
$('stop').onclick=stopAll;
$('mute').onclick=()=>{
  band.volume(band.state.volume,!band.state.muted);
  $('mute').setAttribute('aria-pressed',String(band.state.muted));
  $('mute').setAttribute('aria-label',band.state.muted?'Unmute sound':'Mute sound');
  $('speaker-waves').setAttribute('d',band.state.muted?'M17 9l5 6m0-6l-5 6':'M16 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14');
};
$('volume').oninput=e=>band.volume(Number(e.target.value)/100,band.state.muted);
const mixNames=Object.keys(band.mixDefaults);
try {
  const saved=JSON.parse(localStorage.getItem('plantband.mix.v1'));
  for (const name of mixNames) if (typeof saved?.[name]==='number') band.setMix(name,saved[name]);
} catch (_) { /* Use the default balance if browser storage is unavailable. */ }
function saveMix() {
  try { localStorage.setItem('plantband.mix.v1',JSON.stringify(band.mix)); } catch (_) {}
}
for (const name of mixNames) {
  const slider=$('mix-'+name);
  slider.value=Math.round(band.mix[name]*100);
  slider.oninput=()=>{band.setMix(name,Number(slider.value)/100);saveMix();};
}
$('reset-mix').onclick=()=>{
  for (const name of mixNames) {
    band.setMix(name,band.mixDefaults[name]);
    $('mix-'+name).value=Math.round(band.mix[name]*100);
  }
  saveMix();
};
$('tilt').oninput=e=>{
  const value=Number(e.target.value)/100;
  if(manual())setTilt(value);
};
function bindPad(el,down,move,up) {
  const captured=new Set();
  window.addEventListener('plantbandstop',()=>captured.clear());
  el.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    e.preventDefault();el.focus({preventScroll:true});
    el.setPointerCapture(e.pointerId);captured.add(e.pointerId);down(e);
  });
  el.addEventListener('pointermove',e=>{if(captured.has(e.pointerId))move?.(e);});
  for(const event of ['pointerup','pointercancel','lostpointercapture']) {
    el.addEventListener(event,e=>{if(captured.delete(e.pointerId))up(e);});
  }
}
function relativeX(el,e) {
  const box=el.getBoundingClientRect();
  return clip((e.clientX-box.left)/box.width);
}
function padPressure(e) {
  return e.pointerType==='pen'&&e.pressure>0?e.pressure:Math.max(.15,relativeX($('pinch'),e));
}
const pinchMove=e=>pinchLeaf(true,e.pointerId,padPressure(e));
bindPad($('pinch'),pinchMove,pinchMove,e=>pinchLeaf(false,e.pointerId));
const flexMove=e=>flexStem(true,e.pointerId,relativeX($('flex'),e));
bindPad($('flex'),flexMove,flexMove,e=>flexStem(false,e.pointerId));
bindPad($('touch'),e=>touchStem(true,e.pointerId),null,e=>touchStem(false,e.pointerId));

// Also support assistive technology that activates a button through a click alone.
const actions={pinch:pinchLeaf,flex:flexStem,touch:touchStem};
for(const name of ['pinch','touch']) {
  $(name).onclick=e=>{
    if(e.detail!==0)return;
    const id=Symbol(name);
    actions[name](true,id,.65);
    setTimeout(()=>actions[name](false,id),500);
  };
}
const shortcuts={KeyF:'pinch',KeyB:'flex',KeyC:'touch'};
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.code==='Escape') {e.preventDefault();stopAll();return;}
  const focused=document.activeElement.id;
  const local=(e.code==='Space'||e.code==='Enter')&&actions[focused];
  const name=local?focused:shortcuts[e.code];
  if(name) {
    e.preventDefault();if(e.repeat)return;
    keys.set(e.code,name);
    actions[name](true,e.code,name==='flex'?.4:(e.shiftKey?1:.65));
    return;
  }
  if(['ArrowLeft','ArrowRight'].includes(e.code)&&(hands.flex.size>0||focused==='flex')) {
    if(window.plantHardware?.connected)return;
    e.preventDefault();
    const amount=clip(band.state.pitch+(e.code==='ArrowLeft'?-1:1)/24);
    if(hands.flex.size)flexStem(true,[...hands.flex.keys()].pop(),amount);
    else band.setLead(false,amount);
  }
});
window.addEventListener('keyup',e=>{
  const name=keys.get(e.code);
  if(name) {e.preventDefault();actions[name](false,e.code);keys.delete(e.code);}
});
window.addEventListener('blur',stopAll);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});

window.addEventListener('stemcontactchange',()=>{
  const touched=band.state.chime;
  $('touch').setAttribute('aria-pressed',String(touched));
  $('stem-contact').textContent=touched?'Stem touched':'Touch the stem';
});

function updateControls() {
  const state=band.state;
  $('cursor').style.left='calc('+state.pitch*100+'% - 2px)';
  $('flex').setAttribute('aria-valuenow',String(Math.round(state.pitch*100)));
  $('flex').setAttribute('aria-valuetext',Math.round(state.pitch*100)+' percent bent');
  for(const [name,on] of [['pinch',state.pinching],['flex',state.lead],['bass',band.bassPlaying]]) {
    document.querySelector('.channel.'+name).classList.toggle('active',on);
  }
}
setInterval(updateControls,65);
