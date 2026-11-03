// Four continuously running voices. Coefficients, pitches and timing follow PlantBand.ino.
const band = (() => {
  const names = ['drum', 'bass', 'chime', 'lead'];
  const waves = [[0,100,0,26],[0,70,37,19],[0,79,0,31,0,16],[0,91,35]];
  const voices = {};
  const bassNotes = [130.81,164.81,196,261.63], chimeNotes = [523.25,659.25,783.99,1046.5];
  const state = {wet:0, pitch:0.5, lead:false, chime:false, muted:false, volume:0.65,
    drumAt:-10, bassAt:-10, chimeAt:-10, drumStrength:0, bassNote:0, chimeNote:0};
  let context, master, filteredWet=0, bassPlaying=false, nextBass=0, nextChime=0, chimeIndex=0;
  function hold(param, t) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else { const old=param.value; param.cancelScheduledValues(t); param.setValueAtTime(old,t); }
  }
  function setup() {
    const AC=window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('This browser does not support Web Audio. Open the demo in a current browser.');
    context=new AC();
    master=context.createGain();
    master.gain.value=state.muted?0:state.volume;
    master.connect(context.destination);
    names.forEach((name,i)=>{
      const osc=context.createOscillator(), gain=context.createGain();
      const harmonics=Float32Array.from(waves[i],v=>v/128);
      osc.setPeriodicWave(context.createPeriodicWave(new Float32Array(harmonics.length),harmonics,{disableNormalization:true}));
      gain.gain.value=0;
      osc.connect(gain).connect(master); osc.start();
      voices[name]={pitch:osc.frequency,amp:gain.gain};
    });
    setInterval(tick,20);
  }
  function activate() {
    try {
      if (!context) setup();
      if (context.state!=='running') context.resume().catch(showAudioError);
      return true;
    } catch(error) { showAudioError(error); return false; }
  }
  function showAudioError(error) {
    const el=document.getElementById('error');
    el.hidden=false; el.textContent='Audio could not start. '+error.message;
  }
  function note(name,hz,amplitude,start,duration,quadratic=false) {
    const {pitch,amp}=voices[name];
    hold(pitch,start); pitch.setValueAtTime(hz,start);
    hold(amp,start); amp.linearRampToValueAtTime(amplitude/512,start+0.003);
    for(let i=1;i<=8;i++) {
      const remaining=1-i/8;
      amp.linearRampToValueAtTime(amplitude/512*(quadratic?remaining*remaining:remaining),start+0.003+(duration-0.003)*i/8);
    }
  }
  function quiet(name) {
    if (!context) return;
    const t=context.currentTime, amp=voices[name].amp;
    hold(amp,t); amp.setTargetAtTime(0,t,0.003);
  }
  function drum(strength) {
    if (!context) return;
    const t=context.currentTime;
    state.drumAt=t; state.drumStrength=strength;
    note('drum',420,60+80*strength,t,0.165,true);
    for(let i=1;i<=8;i++) voices.drum.pitch.linearRampToValueAtTime(135+285*(1-i/8)**2,t+0.165*i/8);
  }
  function setChime(on) {
    if (state.chime===on) return;
    state.chime=on;
    if (on && context) { nextChime=context.currentTime; chimeIndex=0; tick(); }
    else quiet('chime');
  }
  function setLead(on,pos=state.pitch) {
    const wasOn=state.lead;
    state.pitch=Math.min(1,Math.max(0,pos)); state.lead=on;
    if (!context) return;
    const t=context.currentTime, {pitch,amp}=voices.lead;
    const hz=261.63*2**(2*state.pitch);
    if (on) {
      hold(pitch,t);
      if (wasOn) pitch.setTargetAtTime(hz,t,0.016);
      else { pitch.setValueAtTime(hz,t); hold(amp,t); amp.setTargetAtTime(110/512,t,0.003); }
    } else if (wasOn) quiet('lead');
  }
  function tick() {
    if (!context || context.state!=='running') return;
    const t=context.currentTime;
    filteredWet+=0.34*(state.wet-filteredWet);
    if (!bassPlaying && filteredWet>=0.18) { bassPlaying=true; nextBass=t; }
    else if (bassPlaying && filteredWet<=0.10) { bassPlaying=false; quiet('bass'); }
    if (bassPlaying && nextBass<=t+0.025) {
      const at=Math.max(t,nextBass);
      state.bassNote=Math.min(3,Math.floor(filteredWet*4)); state.bassAt=at;
      note('bass',bassNotes[state.bassNote],115,at,0.44); nextBass=at+0.6;
    }
    if (state.chime && nextChime<=t+0.025) {
      const at=Math.max(t,nextChime);
      state.chimeAt=at; state.chimeNote=chimeIndex;
      note('chime',chimeNotes[chimeIndex],100,at,0.3,true);
      chimeIndex=(chimeIndex+1)%4; nextChime=at+0.3;
    }
  }
  function level(name) {
    if (!context) return 0;
    const t=context.currentTime;
    if (name==='lead') return Number(state.lead);
    const age=t-state[name+'At'];
    if (age<0 || (name==='bass' && !bassPlaying) || (name==='chime' && !state.chime)) return 0;
    return Math.max(0,1-age/({drum:0.165,bass:0.44,chime:0.3}[name]));
  }
  function stop() {
    state.wet=filteredWet=0; bassPlaying=false; setChime(false);setLead(false);
    names.forEach(quiet);
    state.drumAt=state.bassAt=state.chimeAt=-10;
  }
  function volume(value,muted) {
    state.volume=value; state.muted=muted;
    if (master) master.gain.setTargetAtTime(muted?0:value,context.currentTime,0.008);
  }
  return {state,activate,drum,setChime,setLead,stop,volume,level,
    get bassPlaying(){return bassPlaying;},get running(){return context?.state==='running';}};
})();
