# IK lesson teaser

A 21.5-second teaser for this lesson: two opening questions, five moments of the
lesson beside a "What you will learn" list, and a closing card, over an original
music track. It is a plain web page drawn frame by frame, with no video framework.

## Edit it

- `teaser.js`: the timeline at the top of the file. It sets how long the hook,
  each shot and the end card last, the opening questions, and for each shot the
  clip it shows, where in the clip it starts, and its "What you will learn" line.
  Keep durations in multiples of 0.5 s so the cuts land on the music's beat.
- `teaser.html`: the texts of the closing card, and all colours, sizes and
  positions.
- `make_music.py`: the music, synthesized from code. Every render makes it again
  to fit the timeline, with the beat playing from the first shot to the end card.
  To use a track you own instead, save it as `own-music.wav`; a track shorter
  than the video is padded with silence.

## Render it

```bash
node lessons/IK-beginners/teaser/render.mjs
```

This writes `out/teaser.mp4` in under a minute. It needs FFmpeg, `uv` for the
music, and Playwright's Chromium (`pnpm exec playwright install chromium`).

## The lesson clips

`clips/` holds short exports of the lesson, made with `lesson video` (on the
`cli/video-export` branch until it is merged):

| Clip | Lesson time |
|---|---|
| `arm.mp4` | 36.5 to 43.0 s |
| `elbow.mp4` | 213.0 to 221.5 s |
| `joints.mp4` | 498.0 to 503.5 s |
| `teleop.mp4` | 581.0 to 587.0 s |
| `brick.mp4` | 614.5 to 619.5 s |

```bash
pnpm lesson video --lesson lessons/IK-beginners -o lessons/IK-beginners/teaser/clips/arm.mp4 --from 36.5 --to 43
```

The times match the narration built on 25 September 2026. After a narration
change, check them again, and keep each range clear of pause checkpoints so no
"Paused" hold appears in a clip. `clips/`, `frames/`, `out/`, `music.wav` and
`own-music.wav` are not committed.
