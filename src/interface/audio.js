// Each gesture owns a looping recording. USB, keyboard, and pointer input use the same voices.
const band = (() => {
  // Keep the existing channel keys so saved Sound balance settings still apply.
  const clips = {
    drum: {file:'cello', start:0.90},
    bass: {file:'double-bass', start:0.03},
    chime: {file:'viola', start:0.95},
    lead: {file:'violin', start:0.03}
  };
  const mixDefaults = Object.freeze({drum:1, bass:0.85, chime:0.65, lead:0.65});
  const mix = {...mixDefaults};
  const state = {
    tilt:0, motion:0, pitch:0, lead:false, chime:false, pinching:false, force:0,
    pot:false, chorus:false, discovered:false, muted:false, volume:0.65
  };
  const voices = {};
  let context, master, initialized = false, filteredTilt = 0, bassPlaying = false, potAt = 0;
  const now = () => performance.now() / 1000;
  const clamp = value => Math.max(0, Math.min(1, value));

  function audioError(message) {
    const el = document.getElementById('error');
    el.hidden = false;
    el.textContent = message;
  }

  function newVoice(clip, channel) {
    const media = new Audio('./clips/' + clip.file + '.wav');
    media.preload = 'auto';
    media.loop = true;
    media.preservesPitch = false;
    const voice = {clip, channel, media, active:false, strength:0, pauseAt:0, unlocked:false, request:0};
    if (context) {
      voice.envelope = context.createGain();
      voice.balance = context.createGain();
      voice.envelope.gain.value = 0;
      voice.balance.gain.value = mix[channel] ?? 1;
      context.createMediaElementSource(media).connect(voice.envelope).connect(voice.balance).connect(master);
    } else {
      // Direct file playback uses the media element's volume (no cross-origin audio graph).
      media.volume = 0;
    }
    media.addEventListener('error', () => audioError('Could not load the ' + clip.file + ' recording. Reload Plant Band to try again.'));
    return voice;
  }

  function play(voice) {
    if (!voice.media.paused) return;
    const request = ++voice.request;
    voice.media.play().then(() => {
      if (request !== voice.request) return;
      voice.unlocked = true;
      if (!voice.active) voice.media.pause();
    }).catch(error => {
      if (request === voice.request && error.name !== 'AbortError') {
        voice.unlocked = false;
        if (voice.active) audioError('Could not play ' + voice.clip.file + '. ' + error.message);
      }
    });
  }

  function setup() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (window.location.protocol !== 'file:' && AudioContextClass) {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = state.muted ? 0 : state.volume * 0.8;
      master.connect(context.destination);
    }
    for (const [channel, clip] of Object.entries(clips)) voices[channel] = newVoice(clip, channel);
    // The optional pot duet has its own players, so it cannot take over a held leaf or stem.
    voices.potCello = newVoice(clips.drum);
    voices.potViola = newVoice(clips.chime);
    initialized = true;
    setInterval(tick, 20);
  }

  function activate() {
    try {
      if (!initialized) setup();
      if (context && context.state !== 'running') context.resume().catch(error => audioError(error.message));
      // Give every player the initial user gesture, including parts later triggered over USB.
      for (const voice of Object.values(voices)) if (!voice.unlocked) play(voice);
      return true;
    } catch (error) {
      audioError('Audio could not start. ' + error.message);
      return false;
    }
  }

  function updateLocalVolume(voice) {
    voice.media.volume = state.muted ? 0 : voice.strength * (mix[voice.channel] ?? 1) * state.volume * 0.8;
  }

  function gate(voice, on, strength = 1, rate = 1) {
    if (!voice) return;
    const starting = on && !voice.active;
    const stopping = !on && voice.active;
    voice.active = on;
    const target = on ? strength : 0;
    if (target !== voice.strength) {
      voice.strength = target;
      if (context) voice.envelope.gain.setTargetAtTime(target, context.currentTime, 0.009);
      else updateLocalVolume(voice);
    }
    if (on && Math.abs(voice.media.playbackRate - rate) > 0.002) voice.media.playbackRate = rate;
    if (starting) {
      voice.pauseAt = 0;
      voice.media.currentTime = voice.clip.start;
      play(voice);
    } else if (stopping) {
      voice.pauseAt = now() + 0.055;
    }
  }

  function setLead(on, position = state.pitch) {
    state.lead = on;
    state.pitch = clamp(position);
    gate(voices.lead, on, 0.83, 2 ** state.pitch);
  }
  function setPinch(on, pressure = state.force) {
    state.pinching = on;
    state.force = on ? clamp(pressure) : 0;
    gate(voices.drum, on, 0.38 + 0.62 * state.force);
  }
  function setChime(on) {
    state.chime = on;
    gate(voices.chime, on, 0.82);
  }
  function setPot(on) {
    if (state.pot === on) return;
    state.pot = on;
    if (on) potAt = now();
    else {
      state.chorus = false;
      gate(voices.potCello, false);
      gate(voices.potViola, false);
    }
  }

  function tick() {
    const t = now();
    filteredTilt += 0.34 * (Math.abs(state.tilt) - filteredTilt);
    // Either turning an upright pot or holding a tilt can bring in the double bass.
    const activity = Math.max(filteredTilt, state.motion);
    bassPlaying = activity >= (bassPlaying ? 0.10 : 0.18);
    gate(voices.bass, bassPlaying, Math.min(1, 0.52 + 0.32 * filteredTilt + 0.32 * state.motion));
    if (state.pot && !state.chorus && t - potAt >= 0.7) {
      state.discovered = state.chorus = true;
      gate(voices.potCello, true, 0.23);
      gate(voices.potViola, true, 0.18);
    }
    for (const voice of Object.values(voices)) {
      if (!voice.active && voice.pauseAt && t >= voice.pauseAt) {
        voice.media.pause();
        voice.pauseAt = 0;
      }
    }
  }

  function stop() {
    state.tilt = state.motion = filteredTilt = 0;
    bassPlaying = false;
    setLead(false, 0);
    setPinch(false);
    setChime(false);
    setPot(false);
    for (const voice of Object.values(voices)) {
      gate(voice, false);
      voice.pauseAt = 0;
      voice.media.pause();
    }
  }

  function setMix(name, value) {
    if (!Object.hasOwn(mix, name) || !Number.isFinite(value)) return;
    mix[name] = clamp(value);
    const voice = voices[name];
    if (!voice) return;
    if (context) voice.balance.gain.setTargetAtTime(mix[name], context.currentTime, 0.02);
    else updateLocalVolume(voice);
  }
  function volume(value, muted) {
    state.volume = clamp(value);
    state.muted = muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : state.volume * 0.8, context.currentTime, 0.008);
    else for (const voice of Object.values(voices)) updateLocalVolume(voice);
  }
  function level(name) {
    if (name === 'chorus') return state.chorus ? clamp((now() - potAt - 0.7) / 0.4) : 0;
    return voices[name]?.strength ?? 0;
  }
  return {state, activate, setLead, setPinch, setChime, setPot, stop, setMix, volume, level, mixDefaults,
    get mix() { return {...mix}; }, get bassPlaying() { return bassPlaying; }};
})();
