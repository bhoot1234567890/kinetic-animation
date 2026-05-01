// Synthesize a default beat track using Web Audio API offline rendering
// Creates a ~30s electronic beat with kick, snare, hi-hat, bass synth

export async function generateDemoTrack(audioCtx) {
  const sampleRate = audioCtx.sampleRate;
  const bpm = 130;
  const beatDur = 60 / bpm;
  const bars = 16;
  const beatsPerBar = 4;
  const totalBeats = bars * beatsPerBar;
  const duration = totalBeats * beatDur;
  const totalSamples = Math.ceil(duration * sampleRate);

  const offline = new OfflineAudioContext(2, totalSamples, sampleRate);

  // ── Kick drum on beats 0,2 of each bar ──
  for (let bar = 0; bar < bars; bar++) {
    for (const beat of [0, 2]) {
      const t = (bar * beatsPerBar + beat) * beatDur;
      synthKick(offline, t);
    }
  }

  // ── Snare on beats 1,3 ──
  for (let bar = 0; bar < bars; bar++) {
    for (const beat of [1, 3]) {
      const t = (bar * beatsPerBar + beat) * beatDur;
      synthSnare(offline, t);
    }
  }

  // ── Hi-hat every 8th note ──
  for (let i = 0; i < totalBeats * 2; i++) {
    const t = i * beatDur / 2;
    synthHiHat(offline, t, i % 2 === 0 ? 0.12 : 0.06);
  }

  // ── Bass synth (simple sawtooth with filter) ──
  const bassNotes = [55, 55, 65.41, 55, 73.42, 73.42, 65.41, 55]; // A1-ish groove
  for (let bar = 0; bar < bars; bar++) {
    const note = bassNotes[bar % bassNotes.length];
    for (let beat = 0; beat < beatsPerBar; beat++) {
      if (beat === 0 || beat === 2) {
        synthBass(offline, (bar * beatsPerBar + beat) * beatDur, beatDur * 0.8, note);
      }
    }
  }

  // ── Pad stab on bar transitions ──
  for (let bar = 0; bar < bars; bar += 2) {
    const t = bar * beatsPerBar * beatDur;
    synthPad(offline, t, beatDur * 2, [220, 277.18, 329.63]); // Am triad
  }

  return offline.startRendering();
}

function synthKick(ctx, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.4);
}

function synthSnare(ctx, time) {
  // Noise burst
  const bufSize = ctx.sampleRate * 0.15;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);

  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.5, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  const filt = ctx.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 1500;
  noise.connect(filt).connect(noiseGain).connect(ctx.destination);
  noise.start(time);
  noise.stop(time + 0.15);

  // Body tone
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(200, time);
  osc.frequency.exponentialRampToValueAtTime(80, time + 0.05);
  oscGain.gain.setValueAtTime(0.5, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.08);
}

function synthHiHat(ctx, time, vol) {
  const bufSize = ctx.sampleRate * 0.05;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);

  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  const filt = ctx.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 8000;
  noise.connect(filt).connect(gain).connect(ctx.destination);
  noise.start(time);
  noise.stop(time + 0.04);
}

function synthBass(ctx, time, dur, freq) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, time);
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(600, time);
  filt.frequency.exponentialRampToValueAtTime(150, time + dur);
  gain.gain.setValueAtTime(0.25, time);
  gain.gain.setValueAtTime(0.25, time + dur * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(filt).connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + dur);
}

function synthPad(ctx, time, dur, freqs) {
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.08, time + 0.15);
    gain.gain.setValueAtTime(0.08, time + dur - 0.3);
    gain.gain.linearRampToValueAtTime(0.001, time + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur);
  }
}
