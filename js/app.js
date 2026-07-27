(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Elements ----------
  const els = {
    modeTabs: $('modeTabs'),
    settingsBtn: $('settingsBtn'),
    reloadBtn: $('reloadBtn'),
    toast: $('toast'),
    statePill: $('statePill'),
    wavePoly: $('wavePoly'),
    splitValue: $('splitValue'),
    shotCount: $('shotCount'),
    bigTime: $('bigTime'),
    subRow: $('subRow'),
    maxTimeLabel: $('maxTimeLabel'),
    shotLog: $('shotLog'),
    hitFactorBtn: $('hitFactorBtn'),
    startBtn: $('startBtn'),
    resetBtn: $('resetBtn'),

    calModal: $('calModal'),
    calInstructions: $('calInstructions'),
    calWavePoly: $('calWavePoly'),
    calThresholdLine: $('calThresholdLine'),
    calProgress: $('calProgress'),
    calReadout: $('calReadout'),
    calCancelBtn: $('calCancelBtn'),
    calRetestBtn: $('calRetestBtn'),
    calAcceptBtn: $('calAcceptBtn'),

    settingsModal: $('settingsModal'),
    delayMin: $('delayMin'),
    delayMax: $('delayMax'),
    sensSlider: $('sensSlider'),
    sensReadout: $('sensReadout'),
    parTime: $('parTime'),
    maxTime: $('maxTime'),
    calibrateBtn: $('calibrateBtn'),
    calStatusLine: $('calStatusLine'),
    recoilEnabled: $('recoilEnabled'),
    settingsCloseBtn: $('settingsCloseBtn'),

    scoreModal: $('scoreModal'),
    scoreTime: $('scoreTime'),
    scoreGrid: $('scoreGrid'),
    scorePoints: $('scorePoints'),
    scoreHF: $('scoreHF'),
    scoreCloseBtn: $('scoreCloseBtn'),
    scoreSaveBtn: $('scoreSaveBtn'),
  };

  // ---------- Persistent settings ----------
  const SETTINGS_KEY = 'rangeTimerSettings.v1';
  const HISTORY_KEY = 'rangeTimerHistory.v1';

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch { return {}; }
  }
  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  const settings = Object.assign({
    delayMin: 1.0,
    delayMax: 4.0,
    sensitivity: 60,
    parTime: 6.0,
    maxTime: 10,
    recoilEnabled: false,
    calibratedThreshold: null
  }, loadSettings());

  // apply to inputs
  els.delayMin.value = settings.delayMin;
  els.delayMax.value = settings.delayMax;
  els.sensSlider.value = settings.sensitivity;
  els.sensReadout.textContent = settings.sensitivity + '%';
  els.parTime.value = settings.parTime;
  els.maxTime.value = settings.maxTime;
  els.recoilEnabled.checked = settings.recoilEnabled;

  // ---------- State ----------
  let mode = 'COMSTOCK'; // COMSTOCK | VIRGINIA | PAR
  let phase = 'IDLE';    // IDLE | ARMED | LIVE | STOPPED
  let startPerfTime = null; // performance.now() at the START beep
  let shots = [];        // {time, split}
  let displayRafId = null;
  let armTimeoutId = null;
  let endTimeoutId = null;

  const detector = new AudioDetector();
  detector.sensitivity = settings.sensitivity / 100;
  detector.calibratedThreshold = settings.calibratedThreshold;

  // ---------- Motion (Recoil) Detection ----------
  function onMotion(e) {
    if (phase !== 'LIVE' || !detector.armed || !settings.recoilEnabled) return;
    const acc = e.acceleration || e.accelerationIncludingGravity;
    if (!acc) return;
    const total = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    // 25 m/s² is roughly 2.5G, a sharp jar.
    if (total > 25) {
      detector.triggerShot(performance.now(), 0.9);
    }
  }

  // ---------- Beep synthesis (no audio file needed) ----------
  let sharedCtx = null;
  function beep({ freq = 1800, durationMs = 120 } = {}) {
    sharedCtx = sharedCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = sharedCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
  }

  // ---------- Waveform rendering ----------
  const waveBuffer = new Array(60).fill(0);
  function pushWaveSample(level) {
    waveBuffer.shift();
    waveBuffer.push(level);
    const w = 300, h = 40, mid = h / 2;
    const step = w / (waveBuffer.length - 1);
    let pts = '';
    waveBuffer.forEach((v, i) => {
      const y = mid - v * mid * 1.8;
      pts += `${(i * step).toFixed(1)},${y.toFixed(1)} `;
    });
    els.wavePoly.setAttribute('points', pts.trim());
  }

  // ---------- State pill / UI helpers ----------
  function setStatePill(text, cls) {
    els.statePill.textContent = text;
    els.statePill.className = 'state-pill' + (cls ? ' ' + cls : '');
  }

  function fmt(t) { return t.toFixed(2); }

  function renderShotLog() {
    els.shotLog.innerHTML = '';
    shots.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'shot-row';
      row.innerHTML = `<span>${i + 1}</span><span>${fmt(s.time)}</span><span>${fmt(s.split)}</span>`;
      els.shotLog.appendChild(row);
    });
    els.shotLog.scrollTop = els.shotLog.scrollHeight;
    els.shotCount.textContent = '#' + shots.length;
    if (shots.length) {
      els.splitValue.textContent = fmt(shots[shots.length - 1].split);
    }
  }

  function updateSubRow() {
    if (mode === 'VIRGINIA') {
      els.subRow.classList.remove('hidden');
      els.maxTimeLabel.textContent = Number(els.maxTime.value).toFixed(1) + 's';
      els.subRow.firstChild.textContent = 'MAX TIME: ';
    } else if (mode === 'PAR') {
      els.subRow.classList.remove('hidden');
      els.maxTimeLabel.textContent = Number(els.parTime.value).toFixed(1) + 's';
      els.subRow.firstChild.textContent = 'PAR: ';
    } else {
      els.subRow.classList.add('hidden');
    }
  }

  // ---------- Live timer display loop ----------
  function startDisplayLoop() {
    const loop = () => {
      if (phase !== 'LIVE') return;
      const elapsed = (performance.now() - startPerfTime) / 1000;
      els.bigTime.textContent = fmt(elapsed);
      displayRafId = requestAnimationFrame(loop);
    };
    displayRafId = requestAnimationFrame(loop);
  }
  function stopDisplayLoop() {
    if (displayRafId) cancelAnimationFrame(displayRafId);
  }

  // ---------- Core run control ----------
  async function handleStart() {
    if (phase === 'LIVE' || phase === 'ARMED') {
      finishRun('manual-stop');
      return;
    }
    resetRun(false);
    try {
      await detector.init();
    } catch (e) {
      alert('Microphone access is required to detect shots. Please allow mic permission and try again.');
      return;
    }

    phase = 'ARMED';
    setStatePill('WAIT…', 'armed');
    els.bigTime.textContent = '0.00';
    els.startBtn.textContent = 'CANCEL';
    els.startBtn.classList.add('running');

    detector.start({ armed: false });
    detector.onLevel = pushWaveSample;

    if (settings.recoilEnabled) {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().catch(() => {});
      }
      window.addEventListener('devicemotion', onMotion);
    }

    const dMin = Math.max(0.2, parseFloat(els.delayMin.value) || 1);
    const dMax = Math.max(dMin, parseFloat(els.delayMax.value) || 4);
    const delayMs = (dMin + Math.random() * (dMax - dMin)) * 1000;

    armTimeoutId = setTimeout(() => {
      startRunLive();
    }, delayMs);
  }

  function startRunLive() {
    beep();
    if ('vibrate' in navigator) {
      navigator.vibrate(1000);
    }
    startPerfTime = performance.now();
    phase = 'LIVE';
    setStatePill('LIVE', 'live');
    els.startBtn.textContent = 'STOP';

    // brief mute window right after the beep so the beep itself
    // (heard through the mic) isn't logged as a shot
    detector.armed = false;
    setTimeout(() => { if (phase === 'LIVE') detector.armed = true; }, 180);

    detector.onShot = (t, level) => {
      const elapsed = (t - startPerfTime) / 1000;
      const last = shots.length ? shots[shots.length - 1].time : 0;
      shots.push({ time: elapsed, split: elapsed - last });
      renderShotLog();
    };

    startDisplayLoop();

    if (mode === 'VIRGINIA') {
      const maxT = Math.max(0.5, parseFloat(els.maxTime.value) || 10);
      endTimeoutId = setTimeout(() => finishRun('max-time'), maxT * 1000);
    } else if (mode === 'PAR') {
      const parT = Math.max(0.2, parseFloat(els.parTime.value) || 6);
      endTimeoutId = setTimeout(() => {
        beep({ freq: 1200, durationMs: 160 });
        finishRun('par-time');
      }, parT * 1000);
    }
  }

  function finishRun(reason) {
    if (armTimeoutId) clearTimeout(armTimeoutId);
    if (endTimeoutId) clearTimeout(endTimeoutId);
    window.removeEventListener('devicemotion', onMotion);
    stopDisplayLoop();
    detector.armed = false;

    if (phase === 'ARMED' && reason === 'manual-stop') {
      // cancelled before the beep
      phase = 'IDLE';
      setStatePill('IDLE');
      els.startBtn.textContent = 'START';
      els.startBtn.classList.remove('running');
      els.bigTime.textContent = '0.00';
      return;
    }

    // The recorded time is always the last shot heard, never the moment
    // the stop button was pressed (or the buzzer, for VIRGINIA/PAR) —
    // otherwise reaction time to hit STOP, or finishing early before the
    // par/max buzzer, would inflate the string time and tank the hit factor.
    const rawElapsed = startPerfTime ? (performance.now() - startPerfTime) / 1000 : 0;
    const finalTime = shots.length ? shots[shots.length - 1].time : rawElapsed;

    els.bigTime.textContent = fmt(finalTime);
    phase = 'STOPPED';
    setStatePill('STOPPED', 'stopped');
    els.startBtn.textContent = 'START';
    els.startBtn.classList.remove('running');
    lastFinalTime = finalTime;
  }

  let lastFinalTime = 0;

  function resetRun(resetDisplay = true) {
    if (armTimeoutId) clearTimeout(armTimeoutId);
    if (endTimeoutId) clearTimeout(endTimeoutId);
    window.removeEventListener('devicemotion', onMotion);
    stopDisplayLoop();
    shots = [];
    phase = 'IDLE';
    startPerfTime = null;
    renderShotLog();
    setStatePill('IDLE');
    els.startBtn.textContent = 'START';
    els.startBtn.classList.remove('running');
    if (resetDisplay) {
      els.bigTime.textContent = '0.00';
      els.splitValue.textContent = '0.00';
    }
  }

  els.startBtn.addEventListener('click', handleStart);
  els.resetBtn.addEventListener('click', () => resetRun(true));

  // ---------- Mode tabs ----------
  els.modeTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-tab');
    if (!btn) return;
    [...els.modeTabs.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    updateSubRow();
  });
  updateSubRow();

  // ---------- Settings modal ----------
  els.settingsBtn.addEventListener('click', () => els.settingsModal.classList.remove('hidden'));
  els.settingsCloseBtn.addEventListener('click', () => {
    settings.delayMin = parseFloat(els.delayMin.value);
    settings.delayMax = parseFloat(els.delayMax.value);
    settings.sensitivity = parseInt(els.sensSlider.value, 10);
    settings.parTime = parseFloat(els.parTime.value);
    settings.maxTime = parseFloat(els.maxTime.value);
    settings.recoilEnabled = els.recoilEnabled.checked;
    detector.sensitivity = settings.sensitivity / 100;
    saveSettings(settings);
    els.settingsModal.classList.add('hidden');
    updateSubRow();
  });
  els.sensSlider.addEventListener('input', () => {
    els.sensReadout.textContent = els.sensSlider.value + '%';
  });

  function refreshCalStatusLine() {
    els.calStatusLine.textContent = settings.calibratedThreshold != null
      ? `Calibrated — threshold ${settings.calibratedThreshold.toFixed(3)}`
      : 'Not calibrated yet — using default sensitivity.';
  }
  refreshCalStatusLine();

  // ---------- Calibration modal ----------
  let calBuffer = new Array(60).fill(0);
  function pushCalWave(level) {
    calBuffer.shift(); calBuffer.push(level);
    const w = 300, h = 80, base = h - 4;
    const step = w / (calBuffer.length - 1);
    let pts = '';
    calBuffer.forEach((v, i) => {
      const y = base - v * base;
      pts += `${(i * step).toFixed(1)},${y.toFixed(1)} `;
    });
    els.calWavePoly.setAttribute('points', pts.trim());
  }

  async function runCalibration() {
    els.calModal.classList.remove('hidden');
    els.calAcceptBtn.classList.add('hidden');
    els.calRetestBtn.classList.add('hidden');
    els.calProgress.style.width = '0%';
    els.calReadout.textContent = 'Listening…';
    els.calInstructions.textContent = "Fire one shot (or clap loudly) within the window below. We'll set the detection threshold from the peak we hear.";
    calBuffer = new Array(60).fill(0);

    try {
      await detector.init();
    } catch (e) {
      els.calReadout.textContent = 'Microphone permission denied.';
      return;
    }

    const result = await detector.calibrate({
      durationMs: 10000,
      onProgress: (f) => { els.calProgress.style.width = (f * 100).toFixed(0) + '%'; },
      onLevelDuringCal: pushCalWave
    });

    const thresholdY = 80 - result.threshold * 76;
    els.calThresholdLine.setAttribute('y1', thresholdY);
    els.calThresholdLine.setAttribute('y2', thresholdY);
    els.calReadout.textContent = `Peak ${(result.peak * 100).toFixed(0)}% · threshold set to ${(result.threshold * 100).toFixed(0)}%`;
    els.calAcceptBtn.classList.remove('hidden');
    els.calRetestBtn.classList.remove('hidden');
  }

  els.calibrateBtn.addEventListener('click', runCalibration);
  els.calRetestBtn.addEventListener('click', runCalibration);
  els.calCancelBtn.addEventListener('click', () => {
    detector.stop();
    els.calModal.classList.add('hidden');
  });
  els.calAcceptBtn.addEventListener('click', () => {
    settings.calibratedThreshold = detector.calibratedThreshold;
    saveSettings(settings);
    refreshCalStatusLine();
    detector.stop();
    els.calModal.classList.add('hidden');
  });

  // ---------- Scoring modal ----------
  let scoreCounts = { A: 0, C: 0, D: 0, M: 0, NS: 0, PE: 0 };
  let powerFactor = 'minor';

  function buildScoreGrid() {
    els.scoreGrid.innerHTML = '';
    USPSA.SCORE_CATEGORIES.forEach(cat => {
      const cell = document.createElement('div');
      cell.className = 'score-cell';
      cell.innerHTML = `
        <div class="label">${cat.label}</div>
        <div class="stepper">
          <button data-cat="${cat.key}" data-dir="-1">−</button>
          <span class="count" id="count_${cat.key}">0</span>
          <button data-cat="${cat.key}" data-dir="1">+</button>
        </div>`;
      els.scoreGrid.appendChild(cell);
    });
    els.scoreGrid.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        const dir = parseInt(btn.dataset.dir, 10);
        scoreCounts[cat] = Math.max(0, scoreCounts[cat] + dir);
        $('count_' + cat).textContent = scoreCounts[cat];
        updateScoreReadout();
      });
    });
  }

  function updateScoreReadout() {
    const points = USPSA.calcPoints(scoreCounts, powerFactor);
    const hf = USPSA.calcHitFactor(points, lastFinalTime);
    els.scorePoints.textContent = points;
    els.scoreHF.textContent = hf.toFixed(4);
  }

  els.hitFactorBtn.addEventListener('click', () => {
    scoreCounts = { A: 0, C: 0, D: 0, M: 0, NS: 0, PE: 0 };
    els.scoreTime.textContent = fmt(lastFinalTime || 0);
    buildScoreGrid();
    updateScoreReadout();
    els.scoreModal.classList.remove('hidden');
  });
  els.scoreCloseBtn.addEventListener('click', () => els.scoreModal.classList.add('hidden'));
  els.scoreSaveBtn.addEventListener('click', () => {
    const points = USPSA.calcPoints(scoreCounts, powerFactor);
    const hf = USPSA.calcHitFactor(points, lastFinalTime);
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    history.unshift({
      date: new Date().toISOString(),
      mode, time: lastFinalTime, shots: shots.length,
      counts: { ...scoreCounts }, points, hitFactor: hf
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 200)));
    els.scoreModal.classList.add('hidden');
  });

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg, ms = 2500) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), ms);
  }

  // ---------- Update from repo ----------
  // The service worker caches every asset for offline use, which means a
  // plain page refresh (even a manual one on GitHub Pages) can still serve
  // the old cached copy. This tears down the SW + cache and force-fetches
  // everything fresh from the deployed repo.
  async function forceUpdateFromRepo() {
    showToast('Checking for updates…', 60000);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {
      // fall through to reload regardless — worst case it's a normal refresh
    }
    const url = new URL(location.href);
    url.searchParams.set('_v', Date.now()); // cache-bust the reload itself
    location.href = url.toString();
  }

  els.reloadBtn.addEventListener('click', () => {
    if (confirm('Reload the latest version from GitHub Pages? Unsaved shot data on screen will be lost (saved history is kept).')) {
      forceUpdateFromRepo();
    }
  });

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        // Silent background check each launch — if a newer sw.js is found,
        // let the user know via the reload button instead of auto-swapping
        // mid-session (which could wipe an in-progress string).
        reg.update().catch(() => {});
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Update available — tap ⟳ to reload', 6000);
            }
          });
        });
      }).catch(() => {});
    });
  }
})();
