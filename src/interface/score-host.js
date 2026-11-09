// The score runs in Sonic Pi's Ruby VM; the Web Audio node only sets master volume.
async function openPlantScore(context, onVisual, onError) {
  const root = new URL('./vendor/sonic-pi/', document.baseURI).href;
  const [api, score] = await Promise.all([
    import(root + 'sonic_pi.js'),
    fetch('./score/plant_band.rb?v=flex-lead').then(response => {
      if (!response.ok) throw Error('Could not load plant_band.rb');
      return response.text();
    })
  ]);
  const runtime = await api.loadLiveRuntime(root);
  let engine;
  try {
    engine = await api.bootEngine({
      audioContext:context, autoConnect:false, gamepad:false,
      synthdefBaseURL:root + 'engine/synthdefs/'
    }, {runtime});
  } catch (error) {
    runtime.worker?.terminate();
    throw error;
  }
  const master = context.createGain();
  master.gain.value = 0;
  engine.node.connect(master).connect(context.destination);
  // In postMessage mode the first audio blocks initialise the engine's NTP clock.
  // Starting a job on its earlier zero-based clock can schedule the notes out of reach.
  const clockDeadline = performance.now() + 8000;
  while (engine.clock.now() < 2208988800) {
    if (performance.now() > clockDeadline) throw Error('The Sonic Pi audio clock did not start. Try Play demo again.');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const session = api.createLiveSession(runtime, engine, {
    error(record) { onError(record.message || String(record)); },
    record(record, time, stale) {
      if (!stale && record.kind === 'cue' && record.address?.endsWith('/plant_visual')) {
        // mruby reports the cue payload as a list of numbers.
        const values = String(record.val).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi);
        if (values?.length === 4) onVisual(...values.map(Number));
      }
    }
  });
  return {
    run(demo, levels) {
      const prelude = 'set :browser_manual, ' + !demo + '\nset :browser_mix, [' + levels.join(',') + ']\n';
      return session.run(prelude + score);
    },
    cue(name, values) { session.cue('/osc:localhost:0/plant/' + name, values); },
    volume(gain) { master.gain.setTargetAtTime(gain, context.currentTime, 0.008); },
    stop() { master.gain.cancelScheduledValues(context.currentTime); master.gain.setValueAtTime(0,context.currentTime); session.stop(); }
  };
}
