const $=id=>document.getElementById(id);
const hands={chime:new Set(),lead:new Map()};
let playingDemo=false,scoreIndex=0,scoreTimer,oldWet=0;
const clip=x=>Math.max(0,Math.min(1,x));
function wet(value) { band.state.wet=clip(value); $('soil').value=Math.round(band.state.wet*100); }
function clearHands() {
  hands.chime.clear(); hands.lead.clear(); band.setChime(false);band.setLead(false);
}
function stopScore(restore=true) {
  if (!playingDemo) return;
  clearInterval(scoreTimer); playingDemo=false;
  band.stop();
  wet(restore?oldWet:0);
  $('ensemble').setAttribute('aria-pressed','false'); $('ensemble-text').textContent='Play demo';
}
function manual() { stopScore(); return band.activate(); }
function chime(on,id) {
  if (on) { if (!manual()) return; hands.chime.add(id); }
  else if(!hands.chime.delete(id)) return;
  band.setChime(hands.chime.size>0);
}
function lead(on,id,pos) {
  if (on) {
    if (!hands.lead.has(id) && !manual()) return;
    hands.lead.delete(id); hands.lead.set(id,clip(pos));
  } else if(!hands.lead.delete(id)) return;
  const last=[...hands.lead.values()].pop();
  band.setLead(last!==undefined,last??band.state.pitch);
}
function strike(strength) { if(manual()) band.drum(clip(strength)); }
function stopAll() {
  stopScore(false); clearHands(); band.stop(); wet(0);
  window.dispatchEvent(new Event('plantbandstop'));
}
function runScore() {
  if(playingDemo){stopScore();return;}
  if (!band.activate()) return;
  oldWet=band.state.wet; clearHands(); band.stop();
  playingDemo=true; scoreIndex=0;
  $('ensemble').setAttribute('aria-pressed','true'); $('ensemble-text').textContent='Stop demo';
  // Sixteen eighth notes at 100 BPM. Each part uses the same synth as manual play.
  const melody=[null,null,0.0,0.167,0.292,0.292,0.5,null,0.375,0.292,0.167,null,0.0,0.292,0.5,null];
  function next() {
    if(scoreIndex===melody.length){stopScore();return;}
    const i=scoreIndex++,pitch=melody[i];
    wet(i<8?0.58:0.83);
    if([0,3,4,6,8,10,12,15].includes(i))band.drum(i%4===0?0.92:0.48);
    band.setChime(i>=2 && i<15);
    band.setLead(pitch!==null,pitch??band.state.pitch);
  }
  next(); scoreTimer=setInterval(next,300);
}
$('ensemble').onclick=runScore; $('stop').onclick=stopAll;
$('mute').onclick=()=>{
  band.volume(band.state.volume,!band.state.muted);
  $('mute').setAttribute('aria-pressed',String(band.state.muted));
  $('mute').setAttribute('aria-label',band.state.muted?'Unmute sound':'Mute sound');
  $('speaker-waves').setAttribute('d',band.state.muted?'M17 9l5 6m0-6l-5 6':'M16 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14');
};
$('volume').oninput=e=>band.volume(Number(e.target.value)/100,band.state.muted);
$('soil').oninput=e=>{const value=Number(e.target.value)/100;if(manual())wet(value);};
function bindPad(el,down,move,up) {
  const captured=new Set();
  window.addEventListener('plantbandstop',()=>captured.clear());
  el.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    e.preventDefault(); el.focus({preventScroll:true});
    el.setPointerCapture(e.pointerId); captured.add(e.pointerId); down(e);
  });
  el.addEventListener('pointermove',e=>{if(captured.has(e.pointerId))move?.(e);});
  for(const event of ['pointerup','pointercancel','lostpointercapture']) el.addEventListener(event,e=>{
    if(captured.delete(e.pointerId))up?.(e);
  });
}
function relativeX(el,e) {
  const box=el.getBoundingClientRect(); return clip((e.clientX-box.left)/box.width);
}
bindPad($('drum'),e=>strike(e.pointerType==='pen'&&e.pressure>0?e.pressure:relativeX($('drum'),e)));
bindPad($('chime'),e=>chime(true,e.pointerId),null,e=>chime(false,e.pointerId));
const ribbonMove=e=>lead(true,e.pointerId,relativeX($('ribbon'),e));
bindPad($('ribbon'),ribbonMove,ribbonMove,e=>lead(false,e.pointerId));
// Native button activation also works with assistive tools that emit only clicks.
$('drum').onclick=e=>{if(e.detail===0)strike(0.7);};
$('chime').onclick=e=>{if(e.detail===0){chime(true,'assist');setTimeout(()=>chime(false,'assist'),300);}};
const shortcuts=new Map();
function releaseKey(code) {
  const voice=shortcuts.get(code);
  if(voice==='chime')chime(false,code);
  if(voice==='lead')lead(false,code);
  shortcuts.delete(code);
}
function releaseAll() {shortcuts.clear();stopAll();}
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const key=e.code,focused=document.activeElement;
  if(key==='Escape'){e.preventDefault();releaseAll();return;}
  const local=(key==='Space'||key==='Enter')&&['chime','ribbon','drum'].includes(focused.id);
  if(['KeyC','KeyF','KeyL'].includes(key)||local){
    e.preventDefault();if(e.repeat)return;
    const voice=local?({chime:'chime',drum:'drum',ribbon:'lead'}[focused.id]):({KeyC:'chime',KeyF:'drum',KeyL:'lead'}[key]);
    shortcuts.set(key,voice);
    if(voice==='chime')chime(true,key);
    if(voice==='lead')lead(true,key,band.state.pitch);
    if(voice==='drum')strike(e.shiftKey?1:0.65);
    return;
  }
  const arrow=['ArrowLeft','ArrowRight'].includes(key);
  if(arrow&&(focused.id==='ribbon'||hands.lead.size>0)){
    e.preventDefault();
    const pos=clip(band.state.pitch+(key==='ArrowLeft'?-1:1)/24);
    if(hands.lead.size)lead(true,[...hands.lead.keys()].pop(),pos);else band.setLead(false,pos);
  }
});
window.addEventListener('keyup',e=>{if(shortcuts.has(e.code)){e.preventDefault();releaseKey(e.code);}});
window.addEventListener('blur',releaseAll);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});
function noteLabel(f) {
  const m=Math.round(69+12*Math.log2(f/440));
  return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][m%12]+(Math.floor(m/12)-1);
}
function updateReadouts() {
  const s=band.state, d=band.level('drum'), b=band.level('bass');
  const label=noteLabel(261.63*2**(2*s.pitch));
  $('cursor').style.left='calc('+s.pitch*100+'% - 2px)';
  $('ribbon').setAttribute('aria-valuenow',String(Math.round(s.pitch*100)));
  $('ribbon').setAttribute('aria-valuetext',label);
  [['drum',d>0],['bass',b>0],['chime',s.chime],['lead',s.lead]].forEach(([voice,on])=>document.querySelector('.channel.'+voice).classList.toggle('active',on));
}
setInterval(updateReadouts,65);
