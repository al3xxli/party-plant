const band = (() => {
  const state = {tilt:0, motion:0, pitch:0, force:0, lead:false, pinching:false, chime:false, muted:false, volume:0.65};
  const mixDefaults = Object.freeze({keys:1, pad:1, drums:1});
  const mix = {...mixDefaults};
  const clamp = value => Math.max(0, Math.min(1, value));
  let context, loading, host, mode = 'off', ready = false, generation = 0;
  let jobs = Promise.resolve();
  const sent = new Map();

  function message(text) {
    const el = document.getElementById('score-status');
    el.textContent = text;
    el.hidden = !text;
  }
  function contact(on) {
    if (state.chime === on) return;
    state.chime = on;
    window.dispatchEvent(new Event('stemcontactchange'));
  }
  function showDemo(bend, pinch, tilt, touch) {
    if (mode !== 'demo') return;
    state.pitch = bend; state.lead = bend > 0;
    state.force = pinch; state.pinching = pinch > 0;
    state.tilt = tilt; contact(touch > 0);
    window.dispatchEvent(new Event('plantbandvisual'));
  }
  function reportError(error) {
    const el = document.getElementById('error');
    el.hidden = false;
    el.textContent = 'Sonic Pi: ' + (error.message || error);
    window.dispatchEvent(new Event('plantbanderror'));
    stop();
  }
  function send(name, value) {
    if (!ready || mode !== 'manual') return;
    const previous = sent.get(name);
    if (previous !== undefined && (previous === value ||
        (previous !== 0 && value !== 0 && Math.abs(value - previous) < 0.01))) return;
    host.cue(name,[value]);
    sent.set(name,value);
  }
  function sendInputs() {
    send('bend',state.lead ? state.pitch : 0);
    send('pinch',state.pinching ? state.force : 0);
    send('tilt',Math.abs(state.tilt));
    send('touch',Number(state.chime));
  }
  function unlock() {
    if (location.protocol === 'file:') {
      reportError('Open this instrument on localhost or HTTPS. The Setup page has the local server command.');
      return false;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      context ??= new AC();
      // Unlock audio on the user's click, before any module or serial port has loaded.
      if (context.state !== 'running') context.resume().catch(reportError);
      return true;
    } catch (error) { reportError(error); return false; }
  }
  function activate(nextMode = 'manual') {
    if (!unlock()) return false;
    try {
      if (mode === nextMode) return true;
      if (mode !== 'off') host?.stop();
      const token = ++generation;
      mode = nextMode;
      ready = false;
      sent.clear();
      document.getElementById('error').hidden = true;
      if (!host) message('Loading Sonic Pi…');
      loading ??= openPlantScore(context, showDemo, reportError).then(result => host = result)
        .catch(error => { loading = null; throw error; });
      const pending = loading;
      jobs = jobs.then(async () => {
        const engine = await pending;
        if (token !== generation) return;
        await engine.run(nextMode === 'demo', Object.values(mix));
        if (token !== generation) { engine.stop(); return; }
        ready = true;
        engine.volume(state.muted ? 0 : state.volume);
        engine.cue('mix', Object.values(mix));
        sendInputs();
        message('');
      }).catch(error => { if (token === generation) reportError(error); });
      return true;
    } catch (error) { reportError(error); return false; }
  }
  function setLead(on, position = state.pitch) {
    state.lead = on; state.pitch = clamp(position);
    send('bend',on ? state.pitch : 0);
  }
  function setPinch(on, pressure = state.force) {
    state.pinching = on; state.force = on ? clamp(pressure) : 0;
    send('pinch',state.force);
  }
  function setChime(on) { contact(on); send('touch',Number(on)); }
  function setTilt(value, motion = 0) {
    state.tilt = Math.max(-1,Math.min(1,value)); state.motion = clamp(motion);
    send('tilt',Math.abs(state.tilt));
  }
  function stop() {
    generation++;
    const wasPlaying = mode !== 'off';
    mode = 'off'; ready = false; sent.clear();
    if (wasPlaying) host?.stop();
    setLead(false,0); setPinch(false,0); setChime(false); setTilt(0);
    message('');
  }
  function setMix(name, value) {
    if (!Object.hasOwn(mix,name) || !Number.isFinite(value)) return;
    mix[name] = clamp(value);
    if (ready) host.cue('mix',Object.values(mix));
  }
  function volume(value, muted) {
    state.volume = clamp(value); state.muted = muted;
    if (ready) host.volume(muted ? 0 : state.volume);
  }
  // Repeat the current values in case a listener was starting when a gesture arrived.
  setInterval(() => {
    if (ready && mode === 'manual') { sent.clear(); sendInputs(); }
  },500);
  return {state, unlock, activate, setLead, setPinch, setChime, setTilt, stop, setMix, volume, mixDefaults,
    get mix() { return {...mix}; }, get bassPlaying() { return Math.abs(state.tilt) > 0.01; }};
})();
