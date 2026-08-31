# The runner sprite: what ships, and how to replace it

The character on screen is a 2D sprite living in the 3D world -- a textured
quad, tilted once to match the fixed 46-degree camera, fed by a sprite sheet.

## What ships today

Eric supplied a fifteen-angle turnaround of the runner (one standing pose seen
from fifteen directions). `tools/make-sprite.mjs` turned it into:

- `public/sprites/runner.png` -- one column, fifteen rows, one direction per
  row, sorted by angle, background and ground shadow keyed out.
- `public/sprites/runner.json` -- the manifest the loader reads.

There is **no run cycle** in that sheet, so the gait is procedural: the game
bobs, leans and sways the quad with his stride (`public/js/play/player.js`).
At this camera distance it reads as running. The fifteen rows are what make
turning look continuous, and they double as the tumble frames when a car gets
him.

The sheet only covers front, LEFT profile and back views. The manifest sets
`"mirror": true`, so headings toward screen-right borrow the left-side cells
flipped. Nobody has ever noticed a mirrored sprite in a game and nobody will
here.

## The manifest format

```json
{
  "image": "runner.png",
  "frameWidth": 256,
  "frameHeight": 320,
  "worldHeight": 1.78,
  "feetInset": 0.031,
  "directions": [0, 8, 18, 30, 162, 172, 180, 190, 198, 208, 232, 256, 322, 340, 352],
  "mirror": true,
  "animations": {
    "run":  { "startRow": 0, "frames": 1, "fps": 1, "loop": true },
    "idle": { "startRow": 0, "frames": 1, "fps": 1, "loop": true }
  }
}
```

- `directions` -- one entry per sheet ROW, in row order. Either compass names
  (`"n"`, `"ne"`, ...) or degrees. 0 = running away from the camera (up the
  screen), 90 = screen-right, 180 = toward the camera. The loader picks the
  nearest row for any heading, so any number of rows works: 1, 4, 8, 15.
- `mirror` -- allow flipping a row to cover its reflected heading. Turn it
  off only if the sheet covers all directions itself.
- `frames` / `fps` under an animation -- COLUMNS of the sheet. This is the
  upgrade path: a future sheet with a real 8-frame run cycle per direction
  just sets `frames: 8, fps: 14` and lays the frames out as columns. No code
  changes.
- `worldHeight` -- his height in metres in the world.
- `feetInset` -- fraction of the frame height that is empty below his feet.

## Replacing the sprite

Drop a new `runner.png` + `runner.json` into `public/sprites/` and reload.
The loader (`public/js/play/sprite.js`) fetches the manifest at boot; if
either file is missing it falls back to a drawn placeholder, so the game
never fails to start over art.

To process a fresh turnaround like the current one (grid sheet, checkered
background, no alpha):

    node tools/make-sprite.mjs <sheet.png> --inspect
    # look at shots/sprite-cells.png, fix the ORDER table in the tool
    node tools/make-sprite.mjs <sheet.png>

Ask the artist for, in order of preference:

1. **8 directions x 8 run frames**, PNG with real alpha, on a grid --
   the full upgrade, real strides, no mirroring needed.
2. **8 or 15-angle turnaround** with alpha -- what we have, but cleaner.
3. Anything on a light checkered background -- the tool can key it, as it
   did this one.
