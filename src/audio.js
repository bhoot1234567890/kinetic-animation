// Audio engine: Web Audio API setup, cue sheet, beat detection

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.buffer = null;
    this.analyser = null;
    this.freqData = null;
    this.startedAt = 0;
    this.cues = [];
    this.nextCueIndex = 0;
    this.onCue = null;
    this.onBeat = null;
    this.lastBeatTime = 0;
    this.beatThreshold = 180;
    this.beatCooldown = 200; // ms
    this.useBeatDetection = false;
    this._loop = false;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.3;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.connect(this.ctx.destination);
  }

  async loadFile(file) {
    if (!this.ctx) await this.init();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this._setBuffer(audioBuffer);
  }

  loadBuffer(audioBuffer) {
    if (!this.ctx) throw new Error('init first');
    this._setBuffer(audioBuffer);
  }

  _setBuffer(audioBuffer) {
    if (this.source) {
      try { this.source.stop(); } catch {}
    }
    this.buffer = audioBuffer;
    this.source = null;
  }

  loadCues(cues) {
    this.cues = [...cues].sort((a, b) => a.time - b.time);
    this.nextCueIndex = 0;
  }

  play() {
    if (!this.buffer) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.source) {
      try { this.source.stop(); } catch {}
      this.source = null;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.analyser);
    source.loop = this._loop;
    source.onended = () => {
      if (this.source === source) this.source = null;
    };
    source.start(0);
    this.source = source;
    this.startedAt = this.ctx.currentTime;
    this.lastBeatTime = 0;
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch {}
      this.source = null;
    }
  }

  setLoop(loop) {
    this._loop = loop;
  }

  get currentTime() {
    if (!this.ctx) return 0;
    return this.ctx.currentTime - this.startedAt;
  }

  // Check if any cue should fire. Call each frame.
  checkCues() {
    if (!this.onCue || this.nextCueIndex >= this.cues.length) return;
    const t = this.currentTime;
    while (this.nextCueIndex < this.cues.length && t >= this.cues[this.nextCueIndex].time) {
      const cue = this.cues[this.nextCueIndex];
      this.nextCueIndex++;
      this.onCue(cue);
    }
  }

  getTimeToNextCue(fallback = 60 / 130) {
    if (!this.cues.length) return fallback;

    const t = this.currentTime;
    let index = this.nextCueIndex;
    while (index < this.cues.length && this.cues[index].time <= t) {
      index++;
    }

    if (index < this.cues.length) {
      return Math.max(0.05, this.cues[index].time - t);
    }

    if (this.cues.length > 1) {
      const last = this.cues[this.cues.length - 1].time;
      const first = this.cues[0].time;
      return Math.max(0.05, (last - first) / (this.cues.length - 1));
    }

    return fallback;
  }

  // Beat detection via bass energy. Call each frame.
  checkBeat() {
    if (!this.onBeat || !this.analyser) return;
    this.analyser.getByteFrequencyData(this.freqData);

    // Average bass frequencies (bins 0-12 ~ 0-1kHz)
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += this.freqData[i];
    const bassEnergy = sum / 13;

    const now = performance.now();
    if (bassEnergy > this.beatThreshold && (now - this.lastBeatTime) > this.beatCooldown) {
      this.lastBeatTime = now;
      this.onBeat(bassEnergy);
    }
  }

  getBassEnergy() {
    if (!this.analyser || !this.freqData) return 0;
    this.analyser.getByteFrequencyData(this.freqData);
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += this.freqData[i];
    return sum / 13;
  }

  get isPlaying() {
    return this.source && this.ctx && this.ctx.state === 'running';
  }
}
