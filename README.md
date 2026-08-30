# Frogger Plus

Sprint across a rain-soaked New York highway. Three lives. It only gets worse.

A third-person arcade sprint for iPhone, played in the browser and installed
from Safari's share sheet -- no App Store. Bird's-eye camera at 46 degrees,
hold-and-drag anywhere to run, analog and free. Traffic brakes, queues,
crashes and crumples. Lasers cut cars in half. Being hit is, deliberately,
not subtle.

## Playing it on a phone

Once the repo's GitHub Pages is enabled (Settings → Pages → Source: GitHub
Actions), every push to `main` deploys to:

    https://ebleach2010.github.io/frogger-plus/

Open that in Safari on the phone, Share → **Add to Home Screen**, and it
launches fullscreen like a native app.

- **Hold and drag anywhere** -- he runs in the drag direction; further pulls
  run faster. A keyboard (arrows/WASD) works on a desk.
- **Hearts, top-left** -- three lives a round.
- **Power-ups float over the medians**, mid-road on purpose:
  - ★ **Invincible** (3s) -- cars crumple against you instead.
  - ♥ **Extra life** -- instant. Full hearts pay out points instead.
  - » **Out of control** (5s) -- twice the speed, none of the steering.
  - ◉ **Laser eyes** (6s) -- beams from the eyes cut cars in half. The
    halves land, stay, and the traffic behind piles into them.
- **Coins sit in the lanes**, between the cars, where money belongs.
- Every three stages the world changes: highway → flooded street → junkyard,
  then around again, faster and meaner.

## Development

No build step. `public/` is the site, byte for byte.

    npm ci                 # once; also vendors nothing, three.js is committed
    npm run dev            # serves public/ on http://127.0.0.1:8910
    npm test               # the suite battery (pure node, no browser)
    node tools/drives/drive-play.mjs   # Playwright plays a full game
    npm run shots          # screenshots of every surface into shots/

The battery (`tools/suites/`) pins the difficulty curve, Eric's spec numbers
(three lives, the four power-ups, 45-degree camera), the geometry operations
(the laser slice, the crash crumple), the dev server, and ship hygiene
(vendored engine matches the pinned version, no absolute paths, icons and
sprite sheets actually committed). CI runs it on every push and PR; the
Pages deploy runs it again and refuses to ship red.

### Why three.js is committed into `public/vendor/`

Two hard reasons: the build/test container cannot reach any CDN, and a
home-screen app that fetches its engine from a third party at boot is one
outage away from a black screen. `npm run vendor` refreshes the copy from
the pinned package; the `ship` suite fails if the bytes drift.

### The character

The runner is Eric's supplied fifteen-angle turnaround, processed into a
transparent sprite sheet by `tools/make-sprite.mjs`. Directions, mirroring,
and the future run-cycle upgrade path are documented in `docs/SPRITES.md`.

### Layout

    public/
      index.html            shell, HUD DOM, import map
      css/game.css          HUD + screens, safe-area aware
      js/config.js          every tunable number; suites import this
      js/game.js            rules: stages, lives, scoring, collisions
      js/main.js            boot, loop, pause, context-loss recovery
      js/engine/            renderer (DPR cap, adaptive res), post chain,
                            procedural textures, sky+lighting, geometry ops,
                            object pool
      js/world/             road, traffic AI, vehicles, crush engine,
                            scenery per theme, rain
      js/play/              player+ragdoll, controls, sprite, camera,
                            power-ups, laser, gore
      js/ui/hud.js          all DOM reads/writes
      sprites/              the runner sheet + manifest
      vendor/three/         the engine, committed
    tools/
      serve.mjs             dev server (GitHub Pages subpath aware)
      suites/               the battery; run.mjs runs it all
      drives/drive-play.mjs Playwright plays the game end to end
      shots.mjs             screenshot every surface
      make-sprite.mjs       turnaround sheet → sprite sheet + manifest
      make-icons.mjs        draws the app icons
      vendor.mjs            refresh public/vendor/three from node_modules
