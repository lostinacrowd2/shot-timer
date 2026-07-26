# Range Timer

A USPSA-style shot timer PWA: randomized delay start beep, microphone shot
detection with a calibration routine, splits, and hit factor scoring.
No backend, no build step — plain HTML/CSS/JS.

## Run it locally

Mic access requires a secure context, so you can't just double-click
`index.html` — serve it over `http://localhost` or `https://`:

```bash
cd uspsa-timer
python3 -m http.server 8000
# open http://localhost:8000 on your phone/laptop
```

On a phone on the same Wi-Fi, use your computer's LAN IP instead of
localhost, e.g. `http://192.168.1.42:8000` (mic access still requires
`localhost` or `https` — LAN IP over plain http will be blocked by Chrome,
so for phone testing push to GitHub Pages instead, see below).

## Deploy to GitHub Pages (free hosting + real HTTPS)

```bash
cd uspsa-timer
git init
git add .
git commit -m "Range timer PWA"
git branch -M main
git remote add origin https://github.com/<your-username>/range-timer.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source: Deploy from branch → main / (root)**.
Give it a minute, then it's live at `https://<your-username>.github.io/range-timer/`.

## Install on Android as a PWA

1. Open the GitHub Pages URL in Chrome on your phone.
2. Chrome menu (⋮) → **Add to Home screen** → **Install**.
3. It launches full-screen with no browser chrome, works offline (service
   worker caches all assets), and persists calibration/settings in
   `localStorage` on-device.

## How the shot detection works

`js/audioDetector.js` polls the mic via the Web Audio `AnalyserNode` on
every animation frame and tracks peak time-domain amplitude (a gunshot is
a very short transient — peak reacts faster than an RMS window). A shot
fires when peak level crosses a threshold and at least 120ms have passed
since the last one (refractory period, so one shot's decay/echo doesn't
double-count).

**Calibration** (Settings → Calibrate microphone) listens for 10s while you
fire one shot or clap, tracks the ambient noise floor and the peak it
heard, and sets threshold = `max(noiseFloor * 3, peak * 0.55)`. The
Sensitivity slider nudges that threshold ±20% without re-calibrating, for
adjusting to a different bay/backstop without redoing the whole test.

There's also a 180ms mute window right after the start beep so the beep
itself (heard through the mic) never gets logged as shot #1.

## Modes

- **COMSTOCK** — runs until you press Stop. No time limit.
- **VIRGINIA** — auto-stops at a fixed max time you set (Settings).
- **PAR** — start beep, then an end beep at your par time; shots in
  between are still logged with splits.

## Scoring

Tap **SCORE** after a string to enter A/C/D/M/no-shoot/procedural counts.
Points use standard USPSA minor power factor values (A=5, C=3, D=1,
M/NS/PE=-10); hit factor = points ÷ final time. Saved runs go to
`localStorage` under `rangeTimerHistory.v1` — there's no history *view* in
this first pass, just the storage, so it's ready for a stats/history
screen whenever you want one.

## Known rough edges / next steps

- No history/stats screen yet (data's already being saved, just not
  rendered — quick add).
- Power factor is hardcoded to minor in the UI; `js/hitFactor.js` already
  supports major, just needs a toggle wired up.
- No haptic feedback on shot detection — Vibration API would be a cheap
  add for a "did it hear that?" nudge in a loud environment.
- Play Store path when you're ready: wrap this same PWA with [Bubblewrap](
  https://github.com/GoogleChromeLabs/bubblewrap) (Trusted Web Activity) —
  no rewrite needed, it just wraps the hosted PWA in a thin native shell
  and signs an APK/AAB for Play Console.
