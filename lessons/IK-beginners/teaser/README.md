# IK lesson teaser

A 21.5-second teaser for this lesson: two opening questions, five moments of the
lesson beside a "What you will learn" list, and a closing card, over an original
music track. It is a plain web page drawn frame by frame, with no video framework.

## Edit it

- `teaser.js`: every text and the timeline, at the top of the file. It sets how
  long the hook, each shot and the end card last; the hook's label and questions;
  for each shot the clip it shows, where in the clip it starts, and its "What you
  will learn" line; and the closing card's texts. Keep durations in multiples of
  0.5 s so the cuts land on the music's beat.
- `teaser.html`: the layout only: colours, sizes and positions.
- `make_music.py`: the music, synthesized from code. Every render makes it again
  to fit the timeline, with the beat playing from the first shot to the end card.
  To use a track you own instead, save it as `own-music.wav`; a track shorter
  than the video is padded with silence.

## Render it

```bash
node lessons/IK-beginners/teaser/render.mjs
```

This writes a 3840×2160 `out/teaser.mp4` in about a minute and a half. It
needs FFmpeg, `uv` for the music, and Playwright's Chromium
(`pnpm exec playwright install chromium`).

## The lesson clips

`clips/` holds short exports of the lesson, made with `lesson video` (on the
`cli/video-export` branch until it is merged):

| Clip | Lesson time |
|---|---|
| `arm.mp4` | 37.66 to 42.09 s |
| `elbow.mp4` | 217.96 to 222.39 s |
| `joints.mp4` | 499.70 to 504.13 s |
| `teleop.mp4` | 582.14 to 586.57 s |
| `brick.mp4` | 615.34 to 619.77 s |

Each clip starts half a second before its shot, which is why every shot in
`teaser.js` has `trim: 0.5`. `--scale 2` exports the clips at 3840×2160 so
the shots stay sharp in the 4K teaser.

```bash
pnpm lesson video --lesson lessons/IK-beginners -o lessons/IK-beginners/teaser/clips/arm.mp4 --from 37.66 --to 42.09 --scale 2
```

The times match the narration built on 28 September 2026. After a narration
change, check them again, and keep each range clear of pause checkpoints so no
"Paused" hold appears in a clip. `clips/`, `frames/`, `out/`, `music.wav` and
`own-music.wav` are not committed.
