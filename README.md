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

## Packaging for the Play Store

Two files are already scaffolded for this:

- **`.well-known/assetlinks.json`** — proves you own both the app and the
  domain so Android hides the browser address bar (Trusted Web Activity).
  It has a placeholder `sha256_cert_fingerprints` value — after you
  generate the signed package on [pwabuilder.com](https://pwabuilder.com),
  it'll show you the real SHA-256 fingerprint (or you can get it from
  Play Console → your app → Setup → App signing). Replace the placeholder
  with that value and push — it must be live at
  `https://lostinacrowd2.github.io/shot-timer/.well-known/assetlinks.json`
  for verification to pass.
- **`privacy.html`** — Play Console requires a privacy policy URL even for
  apps that collect nothing. Once Pages is live it's at
  `https://lostinacrowd2.github.io/shot-timer/privacy.html` — use that
  exact URL in the Play Console listing.

Steps:

1. Confirm GitHub Pages is enabled and live at the repo URL.
2. Go to [pwabuilder.com](https://pwabuilder.com), enter
   `https://lostinacrowd2.github.io/shot-timer/`, click Start.
3. **Package for stores → Android** → download the generated package
   (includes a signed `.aab` and the real SHA-256 fingerprint).
4. Update `.well-known/assetlinks.json` with that fingerprint, commit, push.
5. Create a [Play Console](https://play.google.com/console) account
   ($25 one-time), create a new app, upload the `.aab`.
6. Fill out the store listing — use the `privacy.html` URL above for the
   privacy policy field.
7. Use the **Internal testing** track first to sideload to your own
   phone in minutes without waiting on review; move to Production when
   you're happy with it.

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
