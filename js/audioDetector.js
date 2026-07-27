/**
 * AudioDetector
 * Listens to the microphone, tracks a rolling noise floor, and fires
 * onShot(timestampMs, peakLevel) whenever a sample exceeds the current
 * threshold and the refractory period has elapsed (so one shot's decay/
 * echo doesn't get counted twice).
 *
 * Levels are 0..1, derived from time-domain peak amplitude (not RMS),
 * since a gunshot is a very short transient and peak tracks it better
 * than an averaged RMS window.
 */
class AudioDetector {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.dataArray = null;
    this.rafId = null;

    this.running = false;
    this.armed = false; // when true, onShot fires; when false we still track level for the waveform

    // Sensitivity: 0..1, where 1 = most sensitive (lowest threshold).
    // Actual threshold = max(floorThreshold, noiseFloor * floorMultiplier)
    this.sensitivity = 0.6;
    this.calibratedThreshold = null; // set by calibrate()

    this.noiseFloor = 0.02;
    this.refractoryMs = 120; // minimum gap between two separate shot detections
    this.lastShotTime = 0;

    this.onLevel = null; // callback(level 0..1) for waveform rendering
    this.onShot = null;  // callback(perfNowMs, peakLevel)
  }

  async init() {
    if (this.audioCtx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.source = this.audioCtx.createMediaStreamSource(this.stream);

    // Add high-pass filter to remove low-frequency noise (wind, handling)
    this.filter = this.audioCtx.createBiquadFilter();
    this.filter.type = 'highpass';
    this.filter.frequency.value = 500;

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0;
    this.dataArray = new Uint8Array(this.analyser.fftSize);

    this.source.connect(this.filter);
    this.filter.connect(this.analyser);
  }

  /** Effective threshold given calibration + sensitivity slider */
  get threshold() {
    const base = this.calibratedThreshold != null
      ? this.calibratedThreshold
      : 0.5; // sane default if never calibrated
    // Sensitivity slider nudges the calibrated value +/-: higher sensitivity = lower threshold
    const nudge = (0.5 - this.sensitivity) * 0.4; // -0.2..+0.2
    return Math.max(0.06, Math.min(0.95, base + nudge));
  }

  _peakLevel() {
    this.analyser.getByteTimeDomainData(this.dataArray);
    let peak = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const v = Math.abs(this.dataArray[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return peak;
  }

  start({ armed = true } = {}) {
    this.armed = armed;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      const level = this._peakLevel();

      // slowly track ambient noise floor when we're not right after a shot
      if (level < this.threshold) {
        this.noiseFloor = this.noiseFloor * 0.98 + level * 0.02;
      }

      if (this.onLevel) this.onLevel(level);

      if (this.armed) {
        const now = performance.now();
        if (level >= this.threshold && (now - this.lastShotTime) > this.refractoryMs) {
          this.triggerShot(now, level);
        }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  triggerShot(timeMs, level) {
    const now = timeMs || performance.now();
    if ((now - this.lastShotTime) > this.refractoryMs) {
      this.lastShotTime = now;
      if (this.onShot) this.onShot(now, level || 0);
      return true;
    }
    return false;
  }

  stop() {
    this.running = false;
    this.armed = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  /**
   * Calibration routine: listen for `durationMs`, capture the single
   * highest peak heard (assumed to be the test shot), and derive a
   * threshold from it. Reports progress via onProgress(fraction 0..1)
   * and live level via onLevel for the calibration waveform.
   * Resolves { peak, threshold, noiseFloor }.
   */
  calibrate({ durationMs = 10000, onProgress, onLevelDuringCal } = {}) {
    return new Promise((resolve) => {
      let peak = 0;
      let floorSum = 0, floorN = 0;
      const startedAt = performance.now();
      this.running = true;
      this.armed = false;

      const loop = () => {
        if (!this.running) return;
        const level = this._peakLevel();
        if (level > peak) peak = level;
        // build a floor estimate from the quietest 70% of samples
        floorSum += level; floorN++;

        if (onLevelDuringCal) onLevelDuringCal(level);

        const elapsed = performance.now() - startedAt;
        if (onProgress) onProgress(Math.min(1, elapsed / durationMs));

        if (elapsed >= durationMs) {
          const avgFloor = floorSum / Math.max(1, floorN);
          // Threshold sits well above ambient noise but comfortably
          // below the observed shot peak.
          const threshold = Math.max(avgFloor * 3, peak * 0.55);
          this.calibratedThreshold = Math.min(0.9, Math.max(0.1, threshold));
          this.noiseFloor = avgFloor;
          resolve({ peak, threshold: this.calibratedThreshold, noiseFloor: avgFloor });
          return;
        }
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    });
  }

  teardown() {
    this.stop();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.audioCtx) this.audioCtx.close();
    this.audioCtx = null;
  }
}

window.AudioDetector = AudioDetector;
