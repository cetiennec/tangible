# Tangible documentation

Start with the [README walkthrough](./README.md#build-your-own-lesson) for your
first lesson. This guide covers the complete authoring workflow and includes
the command, file-format, and directive reference. Framework development is
covered in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Contents

- [Create the lesson files](#create-the-lesson-files)
- [Build and test the scene](#build-and-test-the-scene)
- [Add another scene](#add-another-scene)
- [Write narration and scene hints](#write-narration-and-scene-hints)
- [Convert hints into choreography](#convert-hints-into-choreography)
- [Choose and configure narration](#choose-and-configure-narration)
- [Review and tune the lesson](#review-and-tune-the-lesson)
- [Add a lesson assistant](#add-a-lesson-assistant)
- [Deploy to Hugging Face Spaces](#deploy-to-hugging-face-spaces)
- [Appendix: command and format reference](#appendix-command-and-format-reference)

## Authoring workflow

Tangible's production model starts after the author has decided what to teach.
There is no required planning document. The work begins with an interactive
scene, followed by narration and integration:

1. Build and test the interactive scene.
2. Write the spoken narration with optional scene hints.
3. Let an agent translate the hints into formal choreography.
4. Review offline, then tune the timing against the real voice.
5. Deploy only after the complete lesson has been reviewed.

The human owns the narration, scene intent, and final pedagogical and aesthetic
judgment. The agent implements the scene, translates scene hints into formal
cues, runs technical checks, and prepares an authorized deployment. The agent
must preserve human-written narration unless the author explicitly asks for an
edit.

## Create the lesson files

Build the framework and create a lesson directory:

```bash
pnpm build
pnpm lesson new my-lesson --lesson lessons/my-lesson
```

The authored files are:

```text
lesson.yaml          title, public description, build and provider configuration
script.md            spoken narration, scene hints, and formal cues
assistant.md         optional lesson-assistant guidance
assistant.eval.yaml  optional tracked assistant question cases
scenes/
  scene.ts           scene schema, rendering, and interaction
  ...                optional scene helpers, tests, and visual assets
assets/              optional authored assets
```

The generated `build/` and `.cache/` directories must not be edited or
committed. Tangible currently assumes that every lesson is in English.

New lessons omit production speech configuration. This keeps scene development,
silent builds, and offline narration independent of paid credentials. Add a
`tts` section only when you are ready to review a production voice; a normal
provider-backed preview or deployment then requires that section.

Write a concise, one-sentence `promise` in `lesson.yaml`. Tangible uses it as the
public description in the Hugging Face Space card. The lesson start screen shows
the title, interaction guidance, loading status, Start button, and
phone-orientation notice. The player renders the initial scene behind a
translucent, input-blocking card, so lesson authors do not create or style a
separate onboarding screen.

Add an optional `tags` list with the lesson's subject terms when the lesson will
be published on Hugging Face. Tangible combines these terms with `tangible`,
`education`, and `interactive-learning` when it creates the Space card. Use a
small set of familiar terms that someone might search or filter for:

```yaml
tags:
  - machine-learning
  - optimization
```

A lesson can have one scene or several independent scenes. Existing lessons keep
their `scene: ./scenes/scene.ts` manifest field and their existing behavior.
To introduce another view, follow [Add another scene](#add-another-scene).

## Build and test the scene

Build `scenes/scene.ts` as an ordinary interactive website before writing final
narration. You can write it yourself or ask an agent to implement the smallest
scene that expresses the intended relationship.

### Scene contract

`scenes/scene.ts` exports a parameter `schema` and, when rendered, a scene
module. It may also export presets, named constants, parameter groups, and
build-time bakers.

Parameters are the shared vocabulary between the scene, narration, learner
interaction, and optional lesson assistant. Keep the schema small and
conceptual. Choose parameter ownership deliberately:

- `script` means that a learner's change holds temporarily and then glides back
  to the narration timeline;
- `shared` means that a learner's change persists until the next scripted write;
- `viewer` means that the script stops controlling the value after learner
  interaction during that session. Cameras normally use this mode.

The scene must render from the complete current state. Do not accumulate
authored state frame by frame. Seeking directly to any lesson time must recreate
the same view.

The scene's `render(state, frame)` function also receives temporary parameter
activity in `frame.activity`. Each active parameter has a `source` of
`narration`, `user`, or `assistant` and a `strength` between zero and one. A
scene may use this information to emphasize the visible control or object that
represents that parameter. The player reports narration activity throughout an
animated cue and briefly after an instant cue or completed transition. It
reports user activity while a handle is being dragged or a DOM control writes a
value, followed by the same brief fade.

Parameter activity describes what is being manipulated, not how emphasis must
look. A canvas scene might draw a halo around a knob, a DOM scene might add a
CSS class to an editor region, and a three-dimensional scene might outline an
object. Ignore parameters that have no visible representation. Narration
activity is derived directly from lesson time, so scenes must not compare
consecutive values to infer it.

### Reserve a board region

Every scene intended for a narrated lesson must reserve a stable region for the
board, even if the first version of the script does not use it. The board holds
short equations and notes introduced by narration directives. It is a player
overlay, so showing an item does not move or resize the scene underneath it.

The default board occupies the rightmost 28 percent of the player. Keep
important data, labels, controls, and drag targets out of that region, and leave
enough clear space above the captions and playback controls for at least one
equation or a few short lines of text. Check the result at both desktop and
narrow sizes. Board text must remain legible against the scene, and board items
should be concise enough that scrolling is exceptional.

There is currently no `boardRegion` export in the scene contract. Reserving the
region is therefore an explicit scene-layout responsibility rather than a
compiler-validated declaration. A scene that needs a smaller or differently
placed region may override `.xv-board` in lesson-local CSS, scoped under a class
on that scene's player root. The narration later declares the actual content and
visibility with `@board`, `@highlight`, `@dim`, and `@clear`.

### Scene development loop

Run the scene without narration:

```bash
pnpm lesson ref --lesson lessons/my-lesson
pnpm lesson scene --lesson lessons/my-lesson
```

`lesson ref` prints the exact parameters, ranges, presets, groups, constants,
and bakers exposed by the scene. `lesson scene` starts from schema defaults and
does not read `script.md`, call a provider, or show playback controls. It rebuilds
when the scene or one of its lesson-local dependencies changes.

For multiple scenes, `lesson ref` prints a separate reference for each scene.
Add `--scene cosine` to select one. `lesson scene` previews `initialScene` by
default, or the scene selected with `--scene cosine`. Complete lesson previews
watch all scene modules, their local dependencies, and the manifest.

```bash
pnpm lesson ref --lesson lessons/unit-circle --scene cosine
pnpm lesson scene --lesson lessons/unit-circle --scene cosine
```

Scene modules must remove their DOM listeners, observers, timers, styles, and
other resources in `dispose()`. The player provides a fresh canvas and clears
the scene overlay at each switch. The board, captions, audio, and playback
controls belong to the player and persist across scenes.

Test the scene before writing narration. Try ordinary, boundary, and unusual
values. Check resizing and touch interaction where relevant. Ask for changes in
conceptual terms: what must be manipulable, connected, visible, or easier to
notice.

Give every canvas a meaningful accessible description. If important canvas
controls do not yet have equivalent HTML controls, document that limitation for
visitors instead of implying complete keyboard or screen-reader access.

Follow these design rules:

- Implement the smallest scene that proves the intended relationship.
- Prefer one clear learner action and only a few supporting controls.
- Make states outside the narrated path scientifically meaningful.
- Update connected representations from the same state instead of synchronizing
  them manually.
- Keep schema exports loadable in Node. DOM and renderer creation belong in the
  scene instance.
- Add a baker only for genuinely coupled build-time computation.
- Add a reusable ingredient only after more than one lesson needs it.
- Test scientific or mathematical logic when an error would undermine the
  lesson.

### Design responsive scene layouts

Design against the scene rectangle inside the player, not only against the
browser window. The playback controls and assistant drawer reduce the height
available to the scene, and the player may center a fixed-aspect-ratio scene
inside a wider window. Measure the scene rectangle after the complete player has
laid itself out.

Use these principles for future lessons:

- Treat width and height as independent constraints. A phone in landscape is
  wide but short, so a width breakpoint alone does not describe it.
- Give text a readable minimum size in CSS pixels. Once text reaches that
  minimum, do not keep shrinking its row spacing as a percentage of the scene.
- Lay out each panel from its own bounds. Reserve space for the heading first,
  allocate the remaining height to its control rows, and keep an explicit gap
  between text, controls, and panel edges.
- Use spare padding before reducing text size. If the content still does not
  fit, simplify it or change its arrangement instead of allowing labels to
  overlap.
- Keep touch targets at least 44 by 44 CSS pixels. Separate repeated controls by
  enough distance that their touch regions do not compete.
- Test a dense, post-Start lesson state with the board, captions, playback
  controls, and the assistant in its configured initial state. The landing card
  can hide scene layout failures.

For the current player, include 667 × 375, 844 × 390, and 896 × 414 phone
landscape windows in the review set, alongside a desktop and a tablet. Capture
screenshots at the same meaningful lesson time so that comparisons exercise the
same controls and board content.

For a composition that should enlarge together on large displays, set
`designSize: { width: 1280, height: 720 }` on the exported scene module. Choose
the reference dimensions at which its text, diagrams, and supporting plots have
the intended proportions. Above that size, the player magnifies the scene,
board, captions, introduction, and playback controls together. It measures the
actual player rectangle, including the space reserved for the assistant.
The assistant drawer remains an ordinary HTML interface outside the composition.

The scale never falls below one. Below the reference size, the scene receives
the smaller available rectangle and must use its compact layout, readable text,
and minimum touch targets. Existing scenes that omit `designSize` retain their
previous sizing.

Use `ctx.size()` for canvas layout in a scene that opts in:

```ts
const { width, height, canvasScale } = ctx.size();
g.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
g.clearRect(0, 0, width, height);
g.font = "16px system-ui";
g.lineWidth = 2;
```

Draw and position HTML overlays in the same layout coordinates. A canvas mark
at `x = 100` then aligns with an HTML element at `left: 100px`; fonts, strokes,
and native input controls enlarge together. The canvas backing store still
uses the full display resolution, so the drawing stays sharp. Divide handle
coordinates by `canvasScale` before comparing them with these layout positions.
The existing `ctx.viewport()` and raw handle coordinates remain in canvas
backing pixels.

Use container queries for compact layouts and container-relative units for
fluid text. Browser viewport units such as `vw` refer to the whole browser,
which can be much wider than an embedded lesson. Test the reference size,
2560 × 1440, and 3840 × 2160, including a high-density display, an embedded
player, and resizing while paused. Use the same `designSize` across scenes
when their controls should keep the same apparent size through a scene switch.

The standard player adds a small “Made with Tangible” link at the right end of
the playback controls. Scenes must not reproduce or position this link. If a
scene changes the colors of the player controls, keep `.xv-credit` readable and
preserve its visible keyboard focus indicator.

The exact file format and scene exports are described in
[the reference](#lesson-files-and-manifest).

## Add another scene

The [unit-circle lesson](./lessons/unit-circle/script.md) is a working example:
it moves from a circle to a cosine graph, then returns to the circle. The lesson
keeps one script, voice, caption timeline, board, and optional assistant guide.
Each scene supplies its own rendering, controls, and parameter schema.

### Register the scene files

Keep the existing `scenes/scene.ts` and add a second module, such as
`scenes/cosine.ts`. Both files export the same [scene contract](#scene-contract).
The example's [circle module](./lessons/unit-circle/scenes/scene.ts) and
[graph module](./lessons/unit-circle/scenes/cosine.ts) each expose an independent
`theta` parameter. They can share helper code without sharing parameter values.

In `lesson.yaml`, replace the singular `scene` field with these fields, keeping
the other lesson settings:

```yaml
scenes:
  circle: ./scenes/scene.ts
  cosine: ./scenes/cosine.ts
initialScene: circle
```

The keys `circle` and `cosine` are the names used in the script. Paths are
relative to the lesson directory. Files are not discovered automatically from
the folder: register every module explicitly. `initialScene` selects the view
shown before the first script directive. See the
[reference](#multiple-scenes) for naming rules.

### Switch scenes in the script

Place `@scene(name)` before the spoken phrase that introduces the new view.
This abbreviated example uses the parameters and constants from unit-circle:

```markdown
@scene(circle)
@cue(theta = HALF_PI)
On the circle, a quarter turn puts the point above the center. Its cosine is zero.

@scene(cosine)
@cue(theta = HALF_PI)
On the graph, the same angle has a height of zero.
@cue(theta -> PI, over: 2s) At a half turn, the cosine reaches minus one.
@pause(prompt: "Move the angle slider and explore the curve.")

@scene(circle)
@cue(theta = PI)
Back on the circle, a half turn puts the point on the left. Its cosine is minus one.
```

After `@scene(cosine)`, local directives (`@cue`, `@show`, `@hide`, `@camera`,
`@bake`, and `@track`) refer to the graph until another scene is selected.
Before the first selection, they refer to `initialScene`. Parameter names,
constants, presets, groups, and bakers belong to each module. Use `theta` in
script cues and in scene code, such as `ctx.write("theta", value)` and
`state.theta`; the framework adds scene prefixes to the compiled tracks.
Chapters only mark positions on the timeline and do not select scenes.

### Decide what happens on return

Scene changes are immediate and keep narration running. A scene's values come
from its defaults and authored cues at the current lesson time. Returning does
not reset it: authored transitions continue on the lesson clock while hidden.
In the example, the final `@cue(theta = PI)` deliberately changes the circle
from its earlier quarter turn to a half turn. Omit that cue to return to the
quarter turn, or write `@cue(theta = 0)` to reset it explicitly.

Learner changes, including camera adjustments, clear when leaving a scene or
seeking. Values do not transfer between scenes. Each switch disposes the outgoing
instance and creates the incoming one; follow the cleanup rules in the
[scene development loop](#scene-development-loop).

Board content persists across scenes. Use `@clear(board)` at a switch when it
should disappear, as the complete unit-circle script does. A pause immediately
before a scene change keeps the outgoing scene visible until playback resumes.
Visual anticipation never moves a cue before the preceding scene entry.

### Preview and check the result

Use these commands with the working example, or substitute your lesson path:

```bash
pnpm lesson ref --lesson lessons/unit-circle --scene cosine
pnpm lesson scene --lesson lessons/unit-circle --scene cosine
```

The standalone preview starts the chosen scene from its defaults and does not
run the script. Stop it with `Ctrl+C`, then validate and preview the full lesson:

```bash
pnpm lesson check --lesson lessons/unit-circle
pnpm lesson preview --silent --lesson lessons/unit-circle
```

Play through both switches. Drag a control during the pause, resume, and seek
directly into each scene. Check the return state, board content, and layout in
each view. Use `--offline` instead of `--silent` for audible draft narration.

### Migrate an existing lesson

Lessons that keep the singular `scene` field need no changes. When converting
one to the registry format, review these places:

- If the script used `@scene(main)` to set a module's local `scene` parameter,
  change that directive to `@cue(scene = main)`. In the registry format,
  `@scene(...)` selects a module. Modules do not need a local `scene` parameter.
- Keep local names in ordinary cues and scene code. In `assistant.commandable`,
  evaluation state and rubric fields, and recorded track keys, qualify names
  with the registry id: for example, `theta` becomes `circle.theta`.
- Update the shared assistant guide to explain each view and its controls. The
  assistant can manipulate only the active scene; it cannot select another one.
  See [Allow visual answers](#allow-visual-answers) for configuration.

## Write narration and scene hints

The human owns the spoken argument. Write `script.md` for speech first:

- Keep one conceptual move per paragraph.
- Use the voice to explain significance and direct attention, rather than
  describing every visible movement.
- Introduce terms only when the learner has something visible to attach them to.
- Put prediction or manipulation prompts before the explanation they test.
- Read the prose aloud before tuning animation.

Everything outside front matter, formal directives, and double-bracket hints is
spoken verbatim and used for captions.

Place natural-language scene hints near the sentences they support:

```markdown
I have not changed the step size. I have only made the bowl narrower.
[[Animate the conditioning from round to a narrow valley across these two
sentences. Keep SGD's learning rate fixed.]]
```

A useful hint states what conceptual change should become visible, which phrase
it should align with, what must remain fixed, and any important camera or
emphasis intent. Avoid guessing parameter names or exact numeric values unless
they are pedagogically meaningful. The agent should choose those values from the
implemented scene contract.

Hints do not enter speech synthesis or captions, and they may contain ordinary
`@` signs. Keep each hint until its formal choreography has been reviewed. You
may then remove it or retain it as a synchronized statement of intent.

## Convert hints into choreography

The agent should run `lesson ref` immediately before translating hints into
formal directives such as `@cue`, `@camera`, `@show`, and `@pause`:

```markdown
I have not changed the step size. I have only made the bowl
@cue(kappa -> 25, over: 3s) narrower.
```

Directives anchor to the word immediately following them and are removed before
speech synthesis. A scene change should support the nearby phrase, and unrelated
motion should not be added merely to keep the screen active.

The agent must not rewrite narration to simplify choreography. If the scene
cannot represent a hint faithfully, the agent should explain the mismatch and
ask whether to change the scene or the intent.

Use this integration loop:

```bash
pnpm lesson ref --lesson lessons/my-lesson
pnpm lesson check --lesson lessons/my-lesson
pnpm lesson build --offline --bundle --lesson lessons/my-lesson
pnpm lesson state --lesson lessons/my-lesson --at 10
pnpm lesson frame --lesson lessons/my-lesson --at 10 -o /tmp/frame.png
```

`state --drag <param>=<value>` simulates learner interaction and reconciliation
without a browser. Representative frames help verify visibility and composition.
The complete directive syntax is in
[the reference](#narration-directives).

## Write for the synthesizer

A synthesizer reads the narration exactly as written. It has no idea what the
scene shows, so anything without an obvious spoken form becomes a guess. These
rules cost nothing while drafting and are expensive to discover after a build.

### Give every number and symbol a spoken form

Write out a digit that sits against a word or a letter. `2 DOF` invites a pause
in the middle of the phrase, and `q1` may be spelled out or mangled. Write
`two DOF` and `q one`.

Symbols are worse than digits, because many have no pronunciation at all. An
equals sign is silent, so `L1=L2` loses the verb: write `L one equals L two`.
Bracketed coordinates are read as punctuation or skipped, so write `x y` rather
than `(x,y)`. A hyphen between letters and digits may be read as a minus sign,
so write `S O one oh one` rather than `SO-101`.

An abbreviation is read letter by letter unless it happens to look like a word.
If you want `DOF` spoken as a single syllable, write `doff`. If you want the
letters, leave it as capitals and confirm by listening.

Decimal numbers are safe: a period between two digits is not treated as the end
of a sentence.

### Remember that captions share the text

Narration and captions come from the same words, so a phonetic spelling is
visible to the learner. `q one` in the captions sits beside a diagram labelled
`q₁`, and that mismatch is the price of the correct reading. Decide per term
which matters more. There is no way to spell a word one way for the voice and
another for the caption.

### Never "fix" pronunciation inside a directive

The contents of `@board(...)`, `@cue(...)` and every other directive are removed
before synthesis. They are displayed, never spoken. Rewriting `atan2` as
`atan two` inside `@board(...)` corrupts the formula on screen and changes
nothing you can hear.

This matters most for search and replace. A pass over `script.md` that spells
out numbers must skip directive bodies, or it will quietly damage equations and
labels. Matching `@name(` and scanning to its balanced closing parenthesis,
respecting quotes, is enough; a regular expression that stops at the first `)`
will cut a formula in half.

### A `@pause` prompt is spoken unless you opt out

An authored prompt is injected into the narration and read aloud. Only the exact
text `speak: false` suppresses it. Write the prompt as a spoken sentence, or opt
out.

### Put cues where a speaker would breathe

This applies to providers without word alignment, such as the Qwen endpoint.
Tangible cannot ask them when a word was spoken, so it cuts the narration into
clips and takes the timing from clip durations. Every sentence starts a clip, and
a cue anchor starts one when it falls on a clause break with enough narration on
either side.

A cue placed just after a comma therefore gets an exact time. A cue placed in the
middle of a phrase still works, but its time is interpolated across the clip,
which shifts it by a fraction of a second. Anchor a cue that must land on a
particular beat at a clause break or a sentence start, and let looser cues fall
where the prose wants them.

### Listen before you publish

Read the built audio, not the script. Numbers, acronyms, formulas and any word
you invented for the synthesizer are the parts that go wrong, and they go wrong
silently: a build succeeds whether or not the voice made sense.

## Choose and configure narration

Tangible generates narration during a lesson build, then synchronizes the scene
and captions with the resulting recording. Learners download audio files; they
do not call the speech provider. Voice quality, timing accuracy, and the place
where synthesis runs are separate choices. A locally generated Supertonic
recording can serve a published lesson just like audio from ElevenLabs or the
compatible Qwen endpoint described below.

Tangible currently assumes English throughout the lesson. Its speech adapters
request English even when the underlying model supports other languages. There
is no lesson language setting yet.

### Choose a narration mode

| Mode | What it produces | What you need | How timing is obtained |
|---|---|---|---|
| `--silent` | It produces silent audio for tests and initial scene review. | It needs no model, FFmpeg, or credentials. | It uses a fixed 60 milliseconds per written character. |
| `--offline` | It runs Supertonic 3 locally with a fixed built-in voice. | It needs FFmpeg and the local model, downloaded on first use. | It measures sentence durations and estimates timing within each sentence. |
| No mode flag, with `tts.provider: supertonic` | It uses the same fixed local voice for normal builds and deployment. | It needs FFmpeg and the local model, but no credentials. | It uses the same estimated timing as offline narration. |
| No mode flag, with `tts.provider: elevenlabs` | It uses the configured ElevenLabs voice. | It needs FFmpeg, a voice ID, and `ELEVENLABS_API_KEY`. | It uses character timestamps returned with the speech. |
| No mode flag, with `tts.provider: hf-endpoint` | It uses a speaker served by a compatible Qwen server. | It needs FFmpeg, the endpoint URL, a speaker name, and an endpoint token. | It measures separately generated clips at sentence and cue boundaries, then estimates timing within each clip. |

`--offline` and `--silent` also replace assistant answers with a local substitute.
They override any `tts` section in `lesson.yaml`. A normal build or preview
requires that section; a new lesson intentionally omits it.

Start with a built-in voice when you do not need a particular speaker's identity.
Voice cloning aims to reproduce a person's voice from recordings. Fine-tuning
is a separate training process that adapts model weights; cloning does not
necessarily require it. Tangible consumes an existing voice ID or speaker name.
It does not create a clone or train a model.

### Use the local Supertonic voice

Install FFmpeg through your operating system's package manager and check that
`ffmpeg -version` works. Then run:

```bash
pnpm lesson preview --offline --lesson lessons/my-lesson
```

The model runs on CPU through the installed `sherpa-onnx-node` dependency, so
it does not require a GPU or a Python environment. Tangible currently uses
speaker 0, English, five sampling steps, and a fixed seed. To use this voice in
normal builds and published lessons, add:

```yaml
tts:
  provider: supertonic
  speed: 1
```

Run `pnpm lesson preview --lesson lessons/my-lesson` or
`pnpm lesson build --bundle --lesson lessons/my-lesson`. Deployment uses this
same configuration. Supertonic needs no API key; once the model is installed,
synthesis requires no network. Normal previews still use the live assistant if
one is configured. Use `--offline` to substitute both speech and assistant answers.

`speed` is optional and must be positive; it defaults to 1. Supertonic uses a
fixed voice and model, so omit `tts.voice` and `tts.model`. The CLI rejects them
rather than ignoring them. Builds report that word timing is estimated within
each sentence. Listen to the recording and review captions and cue placement
before publishing; allowing deployment does not improve alignment.

For the development shortcut, configure speed separately:

```yaml
offlineTts:
  speed: 1.2
```

The default is 1; 1.2 requests speech 20 percent faster. Changing it generates
new local audio and recalculates the estimated timings. It does not change
the production provider or the silent test clock.

The first build downloads a pinned 123 MB archive, verifies its checksum, and
extracts it using `tar` with bzip2 support. Later builds reuse the model. Thus
`--offline` means no hosted synthesis or assistant calls; the first model
installation still needs internet access unless the model is supplied locally.

The shared cache root is `~/Library/Caches/tangible` on macOS,
`%LOCALAPPDATA%/tangible` on Windows when that variable is set, and
`$XDG_CACHE_HOME/tangible` or `~/.cache/tangible` on other systems. Models live
under its `tts/` directory. Set `TANGIBLE_CACHE_DIR` to choose another cache root.
For a machine without network access, set `TANGIBLE_SUPERTONIC_MODEL_DIR` to an
already extracted copy of the pinned model. That directory must contain all
model files and `LICENSE`; the required files are listed in
[the model installer](./packages/tts/src/supertonic-model.ts).

The pinned runtime package provides native dependencies for macOS on Apple
Silicon and Intel, Linux on ARM64 and x64, and Windows on x64 and ia32. This
package coverage is not a claim that every platform has been tested in Tangible.
If the CLI reports that the runtime is unavailable, check that pnpm installed
the optional native dependency for your platform. An incomplete model cache
produces an error naming the directory to remove and reinstall. Use `--silent`
when you need to continue without the model or native runtime.

Supertonic's model license is included with the download; see the
[upstream license](https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE).
Kokoro and other local production options belong to the
[TTS improvement plan](./CONTRIBUTING.md#tts-improvement-plan)
and cannot yet be selected in the manifest.

### Configure ElevenLabs

Add this section to the lesson's existing `lesson.yaml`, replacing `VOICE_ID`
with a voice available to your ElevenLabs account:

```yaml
tts:
  provider: elevenlabs
  voice: VOICE_ID
  model: eleven_multilingual_v2
  speed: 0.9
```

`model` and `speed` are optional. The default model is `eleven_multilingual_v2`;
omitting speed uses the provider default. The provider determines the allowed
speed range. Put the key in a gitignored root or lesson-local `.env` file:

```dotenv
ELEVENLABS_API_KEY=your_api_key
```

Run `pnpm lesson preview --lesson lessons/my-lesson` to generate or reuse the
recording. The adapter requests English speech and character timestamps.
Listen to the result and review cue placement before publishing.

An unset or empty `ELEVENLABS_API_KEY` makes a normal build, preview, or deployment
fail with an actionable error, including when a recording is cached. Use
`--silent` or `--offline` explicitly if you want to draft without credentials.

### Connect a compatible Qwen endpoint

`hf-endpoint` is the adapter used for a custom Qwen3-TTS voice hosted on a
Hugging Face Inference Endpoint. It expects the specific HTTP contract below;
an arbitrary Hugging Face model URL or standard inference endpoint is not
automatically compatible. The speech endpoint is separate from the Space that
hosts the finished lesson and from the assistant's inference provider.

The server must already serve your model and register your speaker. Add:

```yaml
tts:
  provider: hf-endpoint
  voice: your_speaker_name
  revision: weights-v1
```

Put these values in a gitignored `.env` file, using the endpoint's base URL
without `/generate`:

```dotenv
TTS_ENDPOINT_URL=https://your-endpoint.endpoints.huggingface.cloud
HF_TTS_TOKEN=your_endpoint_access_token
```

The adapter uses `HF_TTS_TOKEN`, falling back to `HF_TOKEN` if it is unset.
Run `pnpm lesson preview --lesson lessons/my-lesson`. A cached recording does
not contact or wake the endpoint. Otherwise, the CLI reports readiness and
generation progress. It requests a scale-up wait of up to ten minutes for an
endpoint that has scaled to zero.

The existing contract is:

- `GET /health` must return a successful status when the server is ready.
- `POST /generate` receives JSON containing `text`, `language`, `speaker`,
  `seed`, `temperature`, and `top_p`.
- Both requests send `Authorization: Bearer <token>` and
  `x-scale-up-timeout: 600` headers.
- Generation must return a RIFF/WAVE file containing 16-bit PCM audio. All
  clips in the recording must have the same channel count and sample rate.

For the first clip, the request body has this shape:

```json
{
  "text": "The narration for this clip.",
  "language": "English",
  "speaker": "your_speaker_name",
  "seed": 20260717,
  "temperature": 0.9,
  "top_p": 0.95
}
```

The adapter increments the seed for each subsequent clip. The endpoint selects
the model; the adapter supplies the language and generation settings above.
The manifest exposes `provider`, `voice`, and an optional `revision` for this
adapter, and rejects `model` or `speed`. The revision is an author-supplied label
used only for caching: it does not select or deploy server weights and is not
sent to the endpoint. Use a model commit identifier or a version such as
`weights-v1`, and update it whenever the served model changes. Existing manifests
without a revision still work, but Tangible cannot detect a model replacement
behind an unchanged endpoint URL. The
[adapter implementation](./packages/tts/src/huggingface-voice.ts) is the source
of truth for this protocol.

Speaker names identify voices configured on your server; Tangible does not
supply cloned voices. To create your own, follow
[Clone your voice with Qwen3-TTS](./docs/qwen-voice-cloning.md).
The guide covers reference recordings, optional fine-tuning, endpoint hosting,
and a first lesson build, with links to the official implementation guides.

### Understand synchronization and caching

Speech quality does not guarantee accurate timestamps. Supertonic provides no
word alignment, so Tangible distributes character times across each sentence.
The Qwen endpoint also provides no word alignment. Tangible instead synthesizes
separate clips and joins them using their exact audio durations. Every sentence
starts a clip. A cue anchor starts one only where the cut would not disfigure the
speech: it must fall on a clause break, with at least 25 characters of narration
on either side. Each clip is synthesized without sight of its neighbours, so a
cut mid-phrase is spoken as a standalone utterance, with its own falling
intonation and trailing pause. A cue anchor that does not start a clip still gets
a time, interpolated across the clip it falls in; on a full-length lesson this
shifts such a cue by 0.15 seconds on average and by at most about 1.4 seconds.
Clip boundaries are known, but word times inside each clip remain estimates.
Review captions and visual cues against the actual recording for either option. ElevenLabs supplies
character timestamps, which still need a final listening review.

Generated audio and timing are cached in the lesson's `.cache/tts/` directory.
Supertonic shares cached recordings between offline and production builds when
the narration and effective speed match. Their speed settings remain independent.
The key includes narration text, adapter and model identity, voice, speed, and,
for segmented synthesis, the clip boundaries. Editing a cue's target value,
transition duration, or timing offset without moving its text anchor reuses
the audio. Moving, adding, or removing an anchor can change Qwen's clip
boundaries and regenerate the recording even when the spoken words are unchanged,
but only when that anchor is one that starts a clip.

The Qwen cache identity includes the endpoint URL, speaker, authored `revision`,
seed, and generation settings. Changing any of these creates a new recording;
rotating the access token does not. Update `tts.revision` when replacing server
weights at the same URL. The adapter cannot discover that change automatically
without contacting the server, and cached builds make no endpoint calls.

Recordings made before endpoint identity was included in the cache key are
regenerated on the first Qwen build after this update, which may incur provider
costs. Hosted providers require their configuration and credentials even for
cached builds; missing credentials never select silent placeholder audio.

Hosted synthesis may incur costs when audio is generated. A dedicated endpoint
can also incur hosting costs while provisioned, even when Tangible reuses a
cached recording. Learner playback does not generate speech. Assistant requests
have their own provider costs and credentials.

### Audio delivery and credentials

For every audible provider, Tangible uses FFmpeg to convert WAV or MP3 output
into WebM/Opus at 64 kbps and M4A/AAC-LC at 96 kbps. The browser downloads one
supported encoding. Five minutes of audio is approximately 2.4 MB with Opus or
3.6 MB with AAC. Conversion preserves the compiler's timing. Silent builds keep
their deterministic WAV and do not need FFmpeg.

The CLI loads `.env` files from the invocation directory and the lesson
directory. Running commands from the repository root therefore loads the root
file. Keep speech credentials on the build machine or in CI; the released
lesson needs only the generated audio. An optional live assistant separately
needs `HF_TOKEN` on its server. See
[deployment credentials](#credentials-and-limits) for the Space configuration.

## Review and tune the lesson

Use an offline preview while the prose and cue order are changing:

```bash
pnpm lesson preview --offline --lesson lessons/my-lesson
```

The preview remains running when a script or scene edit contains an error. It
shows the compiler diagnostic on a red page and reloads the lesson automatically
after the source is corrected. `lesson check`, `lesson build`, and deployment
still stop on invalid source.

Use `--silent` when the review must avoid FFmpeg and a model download. The
[narration guide](#choose-and-configure-narration) explains installation,
configuration, approximate timing, and caching for each option.

Review the lesson in layers.

### Pedagogy

- Is the conceptual obstacle clear near the beginning?
- Does interaction reveal a relationship that a fixed animation would hide?
- Is there one obvious primary action?
- Does the narration direct attention and explain significance?
- Does a pause invite prediction, comparison, manipulation, or explanation?
- Does the ending formalize or transfer what the learner observed?

### Scene and interaction

- Try ordinary, boundary, and deliberately awkward parameter values.
- Confirm that linked representations remain consistent.
- Check drag targets, labels, captions, and controls at desktop and narrow sizes.
- Test touch when learners may use tablets or phones.
- Pause during an interaction, resume, and seek elsewhere.
- Confirm that cameras and other viewer-owned controls behave as intended.

### Choreography

- Verify that every scene hint was encoded or explicitly rejected.
- Check that visuals anticipate or coincide with the relevant spoken phrase.
- Avoid overlapping transitions unless the overlap is intentional.
- Inspect representative states and frames across every chapter.

Once the prose is stable, remove `--offline` to synthesize or reuse the configured
voice:

```bash
pnpm lesson preview --lesson lessons/my-lesson
```

Tune cue offsets against the real prosody without changing the teaching
argument. Changes that preserve narration and synthesis boundaries reuse cached
audio; moving a Qwen cue anchor can regenerate it. See
[synchronization and caching](#understand-synchronization-and-caching).

## Add a lesson assistant

The optional lesson assistant lets a learner pause playback and ask a written
question. It can answer only in writing, or it can combine a written explanation
with temporary changes to selected scene parameters.

A written-only assistant is the safer default. Add visual control only when a
scene change makes an explanation substantially clearer. The assistant cannot
run arbitrary scene code. It can assign only valid absolute values to parameters
that the lesson explicitly allows.

### Enable the assistant

Add an `assistant` section to `lesson.yaml`:

```yaml
assistant:
  provider: huggingface
  model: google/gemma-4-31B-it:cerebras
  context: assistant.md
  startOpen: true
  commandable: []
```

An empty `commandable` list enables written answers without giving the assistant
control of the scene. `model` selects the Hugging Face router model used by the
deployed lesson. Set `startOpen: true` when the question field should be visible
on arrival. The player keeps it collapsed on viewports no wider than 600 pixels
or no taller than 500 pixels, where an open panel would leave too little room
for the scene. Omit the field to start collapsed everywhere. Then create a short
`assistant.md` containing only guidance that cannot be generated from the scene
contract or lesson script:

```markdown
# Concepts and limits

State facts, assumptions, distinctions, and limitations that are important for
safe answers but are not already clear in the narration.

# Visual answer guidance

Explain how to construct a fair or useful visual demonstration. State what must
remain fixed and when several visual states are genuinely helpful.
```

Write this file as instructions for a teaching assistant that receives a
semantic scene description and current state, but no screenshot. Include facts
needed to interpret the scene and state important limitations explicitly. Add a
short visual-conventions section only when colors, spatial relationships, or
other meanings are not already established by the narration. Do not repeat
control names, ranges, defaults, generic response rules, or lesson conclusions.
Do not put credentials, private information, or unrelated instructions in this
file. The built context is downloaded by the browser and is not private.

The generated prompt adds the lesson title, the spoken lesson organized into
chapters, useful demonstrated settings, board material, and the scene control
contract. Authors do not need to repeat those details in `assistant.md`.

### Configure assistant limits

Put assistant limits in the `assistant.limits` section of `lesson.yaml`. The
block is optional, but writing it out gives a public lesson one visible source
of truth for request sizes, answer sizes, traffic, and provider timeout:

```yaml
assistant:
  provider: huggingface
  model: google/gemma-4-31B-it:cerebras
  context: assistant.md
  limits:
    request:
      bodyBytes: 65536
      questionCharacters: 1000
      historyTurns: 8
      positionCharacters: 2000
    response:
      outputTokens: 1200
      beats: 6
      beatCharacters: 600
      answerCharacters: 2000
      transitionSeconds: 2
    rate:
      browserRequestsPerTenMinutes: 8
      ipRequestsPerTenMinutes: 40
      globalRequestsPerHour: 120
      globalRequestsPerDay: 500
      concurrentProviderCalls: 2
    queue:
      maxPendingRequests: 0
      waitTimeoutSeconds: 20
    providerTimeoutSeconds: 30
  commandable: []
```

These values are also the defaults when the block is absent. Request and answer
limits are enforced by the server, even when a caller bypasses the player. The
browser uses `questionCharacters` and `historyTurns` to keep its own request in
the same bounds. `outputTokens` is sent to the inference provider, while the
remaining response values are checked again after generation.
The generated assistant prompt states the configured `beats` limit so that its
instructions agree with server validation.

The per-browser limit uses the random identifier stored by the player. The
per-IP limit is a second, more generous limit that uses the rightmost address in
`X-Forwarded-For`, falling back to the socket address. The server hashes the
address with a new random salt on every start and never writes it to structured
logs. This limit discourages one connection from rotating browser identifiers,
but shared office, mobile, or conference networks can make several visitors
appear under one address.

The hourly and daily counters cover provider calls that start in the running
server process. When all provider slots are active, up to `maxPendingRequests`
requests wait in arrival order. Set this value to zero to reject excess traffic
immediately. A waiting request leaves the queue after `waitTimeoutSeconds` and
does not consume the hourly or daily provider budget.

All traffic counters and the queue are in memory and reset when the Space
restarts. A provider call that exceeds `providerTimeoutSeconds` is aborted and
reported as a timeout.

### Read assistant logs

The assistant server writes one structured JSON object per operational event:

- `assistant.config` records the effective limits after Space variables have
  been applied;
- `assistant.queued` records that a valid request entered the provider queue;
- `assistant.request` records character counts, history length, queue wait, and
  the current ten-minute, hourly, daily, active, and pending counts;
- `assistant.success` records latency, answer size, provider token counts,
  cached and reasoning token counts when supplied, and the completion reason;
- `assistant.limited` names the limit that rejected a request and includes the
  current traffic counts; and
- `assistant.error` records a safe error category, provider status when known,
  latency, and any token metrics received before the failure.

These logs never contain question text, answer text, prompt content,
credentials, browser identifiers, or raw IP addresses. Provider token counts
are optional because some providers or failed requests do not return them. Use
the request and success events to estimate traffic and token cost, and use
limited, queued, timeout, and provider-status events to diagnose availability.
Read recent or live Hugging Face Space logs with:

```bash
hf spaces logs -n 1000 owner/space
hf spaces logs -f owner/space
```

### Understand the assistant request

The server assembles a readable system message with five numbered sections:

1. The assistant's teaching role, limitations, and scene capabilities.
2. The complete `assistant.md` guide.
3. The lesson narration inside `<lesson_narration>` tags. Each
   `<chapter title="…">` contains its `<spoken_narration>` and, when present,
   separate `<demonstrated_settings>`, `<board_material>`, and
   `<learner_activities>` sections. These tags make the boundary between spoken
   prose and supporting context explicit without exposing authoring directives.
4. Compact lists of changeable controls and read-only scene values. The current
   values arrive in the learner message, so defaults are omitted.
5. Instructions for composing written answer beats. The JSON example is omitted
   because the provider receives a strict response schema separately.

The current learner message contains the lesson position and visible scene state:

```json
{
  "question": "Why is it zero here?",
  "lessonPosition": {
    "chapter": "Projection",
    "narrationJustHeard": "The horizontal projection is the cosine.",
    "pausePrompt": "Try changing the angle."
  },
  "visibleState": {
    "theta": 1.5708,
    "show.projection": true
  },
  "temporaryAssistantState": {
    "theta": 1.5708
  }
}
```

`lessonPosition` contains the latest chapter, the current or most recently
started narration sentence, and the active pause prompt. It never includes
future narration. `temporaryAssistantState` identifies values still coming from
the preceding assistant answer rather than from the lesson or learner.

Up to the configured number of successful turns from the current browser page
precede a follow-up question. The server does not persist this history. The
provider receives no tools and cannot call scene code. It returns one JSON
object whose beats are checked against the configured count and size limits:

```json
{
  "beats": [
    {
      "say": "The written explanation shown to the learner.",
      "set": {},
      "over": 0
    }
  ]
}
```

`set` accepts only allowlisted scene parameters and valid absolute values.
`over` is a visual transition duration from zero to two seconds. The server
concatenates the `say` fields to form the displayed answer.

### Allow visual answers

Run `lesson ref`, then add only parameters with a clear explanatory purpose:

```yaml
assistant:
  provider: huggingface
  model: google/gemma-4-31B-it:cerebras
  context: assistant.md
  commandable:
    - theta
    - show.projection
```

Avoid internal layout values, incidental animation state, and controls that
could leave the scene misleading. `lesson check` rejects unknown parameters.
The server rejects values with the wrong type or outside a declared range.

For a lesson with several registered scenes, use qualified names in this list:

```yaml
  commandable:
    - circle.theta
    - circle.show.projection
    - cosine.theta
```

Keep this list inside `assistant`. The server exposes and accepts writes only
for the active scene's allowed parameters; the global `scene` selector is not
commandable. Describe both views in the same `assistant.md`. Conversation
history continues across scene changes, while temporary visual answers and
pending responses clear on a switch or seek.

Describe how to use allowed controls in `# Visual answer guidance`. For example,
require matched conditions for a fair comparison or discourage changing more
than one variable at a time. The
[optimizers guide](./lessons/optimizers/assistant.md) is a concise example for a
lesson with several commandable controls.

Assistant changes are temporary. They disappear when playback resumes or
another question begins. If the learner manipulates a parameter during an
answer, the learner's value takes precedence.

### Invite and evaluate questions

The question field becomes available after playback has begun and is paused. A
learner may pause manually. Use an authored pause when the lesson should
deliberately invite exploration or questions:

```markdown
@pause(prompt: "Try changing the angle. Ask why the projection equals the cosine.")
```

Validate and preview offline first:

```bash
pnpm lesson ref --lesson lessons/my-lesson
pnpm lesson check --lesson lessons/my-lesson
pnpm lesson preview --offline --lesson lessons/my-lesson
```

The offline answer is deterministic and generic. It checks the interface and
request path, but it does not measure the quality of `assistant.md`.
Whenever a learner asks a question in a local `preview` or `serve` session,
Tangible writes `build/assistant-prompt.txt`. This file shows only the system
prompt and the current user message, exactly as they are sent to the model. It
renders line breaks as normal line breaks instead of JSON escape sequences. It
does not include model settings, earlier conversation messages, the response
schema, or authorization data. Offline mode writes the same prompt without
sending it to the provider. The file is a local generated artifact and is not
included in a release bundle.

For repeatable prompt review, add `assistant.eval.yaml`:

```yaml
repeats: 3

configurations:
  - id: current-model
    model: google/gemma-4-31B-it:cerebras
  - id: thinking-model
    model: Qwen/Qwen3.8-27B:provider
    request:
      reasoning_effort: medium
      chat_template_kwargs:
        enable_thinking: true

cases:
  - id: visual-follow-up
    at: 18.8
    state:
      theta: 1.5708
    turns:
      - question: What does cosine represent here?
        rubric:
          referenceFacts:
            - Cosine is the point's horizontal coordinate on the unit circle.
          forbiddenClaims:
            - Cosine is the vertical coordinate.
          criticalErrors:
            - The answer reverses sine and cosine.
          scene:
            policy: forbidden
      - question: Can you show me a case where it is zero?
        rubric:
          referenceFacts:
            - Cosine is zero at a quarter turn.
          scene:
            policy: required
            preserve: [show.projection]
            requiredChanges: [theta]
            assertions:
              - { param: theta, operator: eq, value: 1.5708 }
```

For multiple scenes, qualify parameter names in `state`, `preserve`,
`requiredChanges`, and assertion `param` fields, such as `circle.theta` and
`circle.show.projection`. Each case's `at` is measured from the start of the
whole lesson, not from scene entry. Choose a time when the intended scene is
active, and recheck those times after changing narration or voice. See the
[unit-circle evaluation cases](./lessons/unit-circle/assistant.eval.yaml).

Render the provider requests without downloading a voice model or making
provider calls:

```bash
pnpm lesson build --silent --lesson lessons/my-lesson
pnpm lesson assistant-eval --lesson lessons/my-lesson -o assistant-eval.json
```

If `configurations` is absent, the evaluator uses the model in `lesson.yaml`
under the configuration id `manifest`. A configuration may set `systemPrefix`
or add provider-specific request fields under `request`. It cannot replace the
messages, response schema, output limit, or other fields that enforce the
assistant contract.

Use `--configuration current-model,thinking-model` or `--case visual-follow-up`
to run a subset. Use `--repeats 1` for a quick compatibility check without
editing the tracked file. Repeating `--configuration` and `--case` is also
supported.

Use `--variant both` only to compare the structured prompt with the former raw
context prompt. In dry mode, deterministic answers supply the history and
temporary scene values needed by later questions. The resulting
`simulatedAnswer` and `simulatedBeats` fields verify prompt structure, not answer
quality.

Add `--real` only when you deliberately want to contact the answer provider:

```bash
pnpm lesson assistant-eval --lesson lessons/my-lesson --real -o assistant-results.json
```

Real evaluation requires `HF_TOKEN` and may incur provider costs.
The evaluator records latency, token metrics when the provider returns them,
and a bounded error category. When a provider returns a concise JSON error
message, the evaluator retains that message for local diagnosis but does not
retain arbitrary response bodies. A failed turn does not stop independent cases.
Later turns in the same conversation are skipped because the missing answer
would make their history invalid.

A turn may remain a plain question string, or it may contain a question and an
authored rubric. `referenceFacts`, `forbiddenClaims`, and `criticalErrors` are
reserved for later model or human grading and are never sent to the candidate
model. The `scene` block drives deterministic checks. Its policy is
`forbidden`, `optional`, or `required`. `preserve` names parameters that must
not change, and `requiredChanges` names parameters that must change. An
assertion checks the final value with `eq`, `lt`, `lte`, `gt`, or `gte`.
Relational operators apply only to scalar parameters.

After saving a real evaluation, grade it in a separate step:

```bash
pnpm lesson assistant-eval-grade \
  --input assistant-results.json \
  -o assistant-grades.json
```

Put an evaluation-only OpenAI key in a gitignored root or lesson-local `.env`
file as `OPENAI_API_KEY`. The grader uses `gpt-5.6-sol` with high reasoning
effort and strict structured output. It makes one paid request for each
successful turn that has an authored rubric and saved evaluation context. Use
`--configuration` and `--case` to grade a subset.

The judge receives the learner-facing context, answer, scene actions, rubric,
and deterministic checks. It does not receive the candidate model or
configuration id. It scores scientific correctness, grounding, pedagogical
quality, scene changes, and scope resistance when applicable. The output also
records critical errors, concise explanations, judge failures with concise JSON
provider messages when available, token use, and a summary by candidate
configuration. A model judge is evidence rather than the final decision;
manually grade a calibration sample and revise ambiguous rubrics before
comparing final scores.

To test real answers without synthesizing real narration, build an offline
bundle and serve that existing bundle:

```bash
pnpm lesson build --offline --bundle --lesson lessons/my-lesson
pnpm lesson serve --lesson lessons/my-lesson
```

Put a dedicated inference token in a gitignored `.env` file as `HF_TOKEN`. Test
direct explanations, questions at different lesson positions, boundary values,
learner-modified states, follow-up questions, and every allowed visual change.

Assistant-enabled bundles include a same-origin Node server because provider
credentials must not be sent to the browser. Lessons without an assistant can
remain static. The server validates question length, conversation history,
answer length, and every scene value. It also applies global, per-browser,
per-IP, and concurrency limits. These controls reduce operational risk, but they do not
replace a review of the assistant's pedagogy and scientific accuracy.

Before release, confirm that:

- representative questions work at several lesson positions;
- every commandable parameter behaves correctly at its boundaries;
- resuming or asking another question removes temporary changes;
- browser assets contain no credentials; and
- rate limits and structured server logs behave correctly.

## Deploy to Hugging Face Spaces

Deployment changes external state and should happen only after the author has
requested it. Install the current `hf` CLI, authenticate it with a token that may
write to the target namespace, and review the real-voice lesson locally first:

```bash
hf auth login
pnpm lesson preview --lesson lessons/my-lesson
```

Use `--offline` only for local review. A release bundle must contain the intended
voice selected in `tts`. To publish with local narration, set
`tts.provider: supertonic` and run deployment without `--offline` or `--silent`.

### Configure the deployment target

Prepare the local deployment files with:

```bash
pnpm lesson deploy --prepare --space namespace/space-name --lesson lessons/my-lesson
```

This command makes no Hugging Face API calls. It records the target in
`lesson.yaml`, creates the appropriate static or Docker Space card when absent,
adds the Tangible base tags and any lesson tags from the manifest, and completes
the narration Git LFS rules. It preserves a valid existing Space card and
refuses to replace a different deployment target.

The generated Space title remains the lesson title. Its short description uses
that title followed by “a Tangible lesson,” so the subject stays prominent while
the framework remains visible on Hugging Face. Tangible shortens an unusually
long title when necessary to respect Hugging Face's 60-character limit.

Record only the stable remote Space identifier in `lesson.yaml`:

```yaml
deployment:
  provider: huggingface
  space: namespace/space-name
```

Use the exact `namespace/name` form rather than a URL. Do not put tokens,
visibility, hardware, or deployment status in the lesson manifest. Those are
mutable remote settings, and deployment never changes them on an existing
Space.

Create `space/README.md` with the Space card and keep `space/.gitattributes`
beside it. A lesson with an assistant must declare:

```yaml
sdk: docker
app_port: 7860
```

A lesson without an assistant uses a static Space and must declare:

```yaml
sdk: static
app_file: index.html
```

The other Space card fields, including `fullWidth` and `header`, also belong in
this README. Tangible prepares `header: default` so Hugging Face keeps its
repository controls outside the lesson. The `mini` header floats over the Space
and can obscure interactive content near the top-right corner.

Track every narration format through Git LFS in `space/.gitattributes`:

```gitattributes
*.webm filter=lfs diff=lfs merge=lfs -text
*.m4a filter=lfs diff=lfs merge=lfs -text
*.mp3 filter=lfs diff=lfs merge=lfs -text
*.wav filter=lfs diff=lfs merge=lfs -text
```

The deployment command checks the finished release and stops if an included
narration format is missing its rule. Without the rule, Hugging Face may store a
large media file through Git LFS while a Docker Space checks out only the small
text pointer, which browsers cannot play.

### Validate without changing Hugging Face

Run a dry deployment before the first release:

```bash
pnpm lesson deploy --lesson lessons/my-lesson --dry-run --create
```

The dry run requires a clean Git worktree, runs `lesson check`, builds or reuses
the configured real voice, creates the deployable bundle, stages the exact
release, and scans it for local credential values. It makes no Hugging Face API
or upload calls. Run the repository's lesson-specific tests separately before a
release.

### Create the private Space

The first remote operation requires an explicit flag:

```bash
pnpm lesson deploy --lesson lessons/my-lesson --create
```

The command creates the Space privately. If the lesson has an assistant, it also
checks for a Space secret named `HF_TOKEN`. A new Space will not have this
secret, but the lesson is still uploaded and started so that playback and
interaction can be reviewed. The command exits successfully and prints a
warning with the Space URL and settings URL. Questions will fail until the
secret is added.

Add a dedicated fine-grained inference token through the Space settings or the
CLI, for example:

```bash
hf spaces secrets add namespace/space-name --secrets-file <secure-file>
```

The secure file must remain outside version control. Adding the secret does not
require another upload. Use the command without `--create` for later lesson
updates:

```bash
pnpm lesson deploy --lesson lessons/my-lesson
```

Later updates use that same command. Without `--create`, deployment refuses to
create a missing or inaccessible Space.

### Release artifact and remote update

Deployment builds `lessons/my-lesson/build/site/`, then creates a temporary
release containing only that generated site plus `space/README.md` and
`space/.gitattributes`. It rejects symbolic links, environment files, caches,
Git metadata, and any generated file containing a loaded provider credential.
It never publishes the monorepo or the lesson source.

Assistant-enabled Docker releases include precompressed Brotli and gzip versions
of browser text assets. The lesson server negotiates these representations while
continuing to serve narration audio with byte-range support for Safari.

The command uses `hf upload` to replace obsolete remote files in one normal
Space commit. The commit message records the clean Tangible source revision, so
the Space history remains a useful deployment and rollback history. No local
release branch or force push is needed.

After upload, the command waits up to ten minutes for the Space to reach the
`RUNNING` state. If the build or runtime fails, it prints the latest build and
runtime logs. On success, it prints the deployed revision and Space URL.

The command never makes an existing Space public or private, changes its
hardware, or replaces secrets. Make visibility changes separately and only
after reviewing the deployed lesson.

### Add a public lesson to the Tangible collection

After the private review is complete and the author has made the Space public,
submit its URL to the [public Tangible lessons
collection](https://huggingface.co/collections/dlouapre/tangible-lessons-6a96e2c4be1533d68e65d7a2).
The collection can include public Spaces from any Hugging Face account. Open a
[GitHub issue](https://github.com/scienceetonnante/tangible/issues/new) with the
Space URL and a one-sentence description so a Tangible maintainer can add it.

A maintainer can add the lesson with the current Hugging Face CLI:

```bash
hf collections add-item \
  dlouapre/tangible-lessons-6a96e2c4be1533d68e65d7a2 \
  namespace/space-name \
  space \
  --exists-ok
```

Collection membership is separate from deployment. Tangible does not require a
creator's collection credentials and does not add a private Space automatically.

### Credentials and limits

Store a dedicated fine-grained inference token as the Space secret `HF_TOKEN`.
Keep build-only credentials such as `HF_TTS_TOKEN`, `TTS_ENDPOINT_URL`, and
`ELEVENLABS_API_KEY` local or in CI. They must not appear in the release artifact
or Space variables.

The normal values come from `assistant.limits` in `lesson.yaml`. Space variables
may temporarily override the operational rate limits and provider timeout
without changing the authored configuration:

- `ASSISTANT_HOURLY_LIMIT`;
- `ASSISTANT_DAILY_LIMIT`;
- `ASSISTANT_CLIENT_10M_LIMIT`;
- `ASSISTANT_IP_10M_LIMIT`;
- `ASSISTANT_MAX_CONCURRENT`;
- `ASSISTANT_MAX_QUEUED`;
- `ASSISTANT_QUEUE_WAIT_SECONDS`;
- `ASSISTANT_PROVIDER_TIMEOUT_SECONDS`.

The hourly, daily, browser, IP, and concurrency overrides must be positive
integers. `ASSISTANT_MAX_QUEUED` must be a non-negative integer; zero disables
waiting. Both timeout values must be positive numbers of seconds. A Space
restart applies the new values and clears the in-memory counters and queue.
Remove the variables to return to the values recorded in `lesson.yaml`.

### Safe release sequence

1. Keep the Space private.
2. Deploy the artifact and review playback, interaction, and captions.
3. Test one real assistant question when enabled.
4. Inspect structured request logs for safe success or error categories.
5. Confirm that browser assets contain no credentials.
6. Make the Space public only after verification and explicit authorization.

For credential rotation, deploy first, replace the secret, revoke the old token,
and test after the container restarts. Test path-containment defenses with a
harmless target such as `/etc/os-release`, never with a sensitive file such as
`/proc/self/environ`.

## Appendix: command and format reference

Use this appendix to look up commands, manifest fields, scene exports, and
narration directives. Follow the [authoring workflow](#authoring-workflow) for
the sequence of production decisions.

- [Command line](#command-line)
- [Lesson files and manifest](#lesson-files-and-manifest)
- [Narration directives](#narration-directives)

### Command line

Build the framework once after cloning the repository or changing framework
code:

```bash
pnpm build
```

All lesson commands then have the same basic form:

```bash
pnpm lesson <command> --lesson lessons/my-lesson
```

`--lesson` selects the lesson directory. You may omit it when your terminal is
already inside that directory.

Run `pnpm lesson --help` for a short overview or
`pnpm lesson help <command>` for common options and examples.

#### Typical command sequence

Create a lesson directory:

```bash
pnpm lesson new my-lesson --lesson lessons/my-lesson
```

Run the scene selected by the manifest by itself while building the interaction:

```bash
pnpm lesson scene --lesson lessons/my-lesson
```

After writing `script.md`, validate and preview the integrated lesson:

```bash
pnpm lesson check --lesson lessons/my-lesson
pnpm lesson preview --offline --lesson lessons/my-lesson
```

`--offline` prevents speech and answer provider calls. It synthesizes English
narration locally with a pinned, quantized Supertonic 3 model and uses the local
assistant substitute. The first offline build downloads a 123 MB model archive;
later builds use the shared local copy. The local voice is intended for quick
iteration, but its sentence-based character timings are approximate and still
need a final check against the production voice.

Use `--silent` when a build needs deterministic silent audio and must not
download the local speech model. Silent audio advances at 60 milliseconds per
written character. Automated tests use this option.

The optional manifest field `offlineTts.speed` sets a positive speed multiplier
for the local Supertonic voice (default 1). For example, `offlineTts: { speed:
1.2 }` requests faster speech. It affects only `--offline` and is included in
the narration cache key.

Remove `--offline` to synthesize or reuse the configured voice:

```bash
pnpm lesson preview --lesson lessons/my-lesson
```

Provider results are cached. Editing cue settings reuses audio when narration
and synthesis boundaries are unchanged; moving a Qwen cue anchor can regenerate
it. See [synchronization and caching](#understand-synchronization-and-caching).
Hosted voices require credentials in a gitignored `.env` file.

Create a deployable site with:

```bash
pnpm lesson build --bundle --lesson lessons/my-lesson
```

Compiled lesson files go to `build/lesson/`. The deployable site goes to
`build/site/`. Both directories are generated. Assistant-enabled Docker bundles
also contain precompressed Brotli and gzip representations of browser text
assets; the lesson server selects the best representation supported by each
visitor's browser.

#### Commands

| Command | Purpose |
|---|---|
| `new <id>` | Create `lesson.yaml`, `script.md`, `scenes/scene.ts`, and an assets directory. |
| `scene` | Run one interactive scene alone; use `--scene <id>` to select a registered scene. |
| `ref` | Print parameters, ranges, presets, groups, constants, and bakers for all scenes, or one with `--scene <id>`. |
| `check` | Validate all runtime scene modules, `script.md`, cues, and assistant configuration without network calls. |
| `preview` | Rebuild changed files and serve the complete lesson locally. |
| `build` | Compile narration, captions, and animation tracks into `build/lesson/`. |
| `build --bundle` | Also create the deployable site in `build/site/`. |
| `state --at <t>` | Print the computed scene state at a lesson time in seconds. |
| `frame --at <t> -o <file>` | Render a PNG of the built lesson at a chosen time. |
| `serve` | Serve an existing bundle without rebuilding or watching source files. |
| `deploy --prepare --space <namespace/name>` | Create or complete local Space metadata without contacting Hugging Face. |
| `deploy` | Build real narration and publish the lesson to its configured Hugging Face Space. |
| `assistant-eval` | Inspect or run tracked assistant questions against a built lesson. |
| `assistant-eval-grade` | Grade a saved real evaluation with an independent OpenAI model. |

#### Options

- `--lesson <dir>` selects the lesson directory.
- `scene --scene <id>` and `ref --scene <id>` select a registered scene. This
  option requires the `scenes` manifest format and does not apply to full-lesson
  commands such as `preview` or `build`.
- `--offline` uses local Supertonic narration and the local assistant substitute.
- `--silent` uses deterministic silent narration and the local assistant substitute.
- `--bundle` asks `build` to create the deployable site.
- `deploy --create` creates the configured Space privately before the first deployment.
- `deploy --dry-run` performs local release checks and builds without contacting Hugging Face.
- `deploy --prepare --space <namespace/name>` records the target and prepares
  the Space card and audio Git LFS rules without a remote operation.
- `--port <number>` and `--host <address>` set the local server address.
- `state --drag <param>=<value>` simulates learner interaction and
  reconciliation.
- `frame --size <width>x<height>` sets PNG dimensions.
- `assistant-eval --variant structured|legacy|both` selects an assistant prompt
  format for comparison.
- `assistant-eval --configuration <id>[,<id>]` runs only the named model
  configurations.
- `assistant-eval --case <id>[,<id>]` runs only the named cases.
- `assistant-eval --repeats <number>` overrides the file's repetition count.
- `assistant-eval --real` contacts the real answer provider.
- `assistant-eval-grade --input <file>` reads a saved real evaluation result.
- `assistant-eval-grade --configuration <id>[,<id>]` and `--case <id>[,<id>]`
  grade a selected subset.

`preview` and `serve` bind to `127.0.0.1` by default. Use `--host 0.0.0.0` only
when another device must reach the local server.

#### Assistant evaluation

`assistant-eval` reads `assistant.eval.yaml` and existing `build/lesson/`
artifacts. Run a silent or offline build first. Without `--real`, it prints the
complete requests that would be sent to the provider and makes no network calls:

```bash
pnpm lesson build --silent --lesson lessons/my-lesson
pnpm lesson assistant-eval --lesson lessons/my-lesson -o assistant-eval.json
```

Use `--variant structured|legacy|both` only when comparing assistant prompt
formats. An evaluation file may define several model configurations, with
provider-specific request settings, and a repetition count. Cases and
configurations are interleaved so that changing provider conditions do not
systematically favor one configuration. `--real` requires `HF_TOKEN` and may
incur provider costs.

Each turn can include an authored rubric with reference facts, forbidden
claims, critical errors, and a scene policy. Successful answers are checked for
required or forbidden scene actions, preserved parameters, final-value
assertions, and exposed internal parameter names. The rubric is written to the
result for grading but is not included in the candidate model request.

Grade a saved real result separately:

```bash
pnpm lesson assistant-eval-grade \
  --input assistant-results.json \
  -o assistant-grades.json
```

This command uses `gpt-5.6-sol` with high reasoning effort and strict structured
output. It sends the question, conversation, visible state, answer, scene
actions, rubric, and deterministic checks. It does not send the candidate
configuration id or model name. The saved grade restores those identifiers so
scores can be summarized by configuration. The command requires
`OPENAI_API_KEY`, makes one paid judge request per gradeable turn, and records
judge failures without discarding other grades.

#### Scene development without narration

`lesson scene` needs only `id` and the scene selection fields in `lesson.yaml`:
either `scene`, or `scenes` with `initialScene`. It loads the selected scene from
schema defaults, preserves interactions until reset or reload, and watches the
manifest and lesson-local source dependencies. It does not read `script.md`,
voice settings, assistant context, or compiled lesson artifacts. Its temporary
browser bundle is stored in `build/scene-preview/`.

With a registry, the default is `initialScene`. Select another module with:

```bash
pnpm lesson scene --lesson lessons/unit-circle --scene cosine
```

This preview shows one module at a time. Use `lesson preview` to run the script
and review scene changes on the narration timeline.

### Lesson files and manifest

#### Authored files

```text
lesson.yaml             identity, public description, defaults, voice provider, assistant
script.md               narration, natural-language hints, and formal directives
assistant.md            optional semantic assistant context
assistant.eval.yaml     optional tracked assistant question cases
scenes/
  scene.ts              scene entry module
  ...                   additional scene modules, helpers, tests, and visual assets
assets/                 optional authored assets
```

`build/` and `.cache/` are generated and gitignored. Tangible currently assumes
that every lesson is in English. A lesson has one script, one voice, one set of
captions, one assistant guide, and either one scene module or a registry of scenes.

Chapters are markers on the narration timeline. They do not select scene files.
In a single-scene lesson, `@scene(name)` changes the module's `scene` schema
parameter as before. In a multiple-scene lesson, it selects a registered module.

#### Multiple scenes

For a step-by-step example, see
[Add another scene](#add-another-scene) and the
[unit-circle manifest](./lessons/unit-circle/lesson.yaml).

Use `scenes` and `initialScene` instead of the singular `scene` field:

```yaml
scenes:
  circle: ./scenes/scene.ts
  cosine: ./scenes/cosine.ts
initialScene: circle
```

The registry must be nonempty. Scene ids start with a letter and contain letters,
digits, hyphens, or underscores. `board` is reserved. `initialScene` must identify
a registered module. Combining the singular and plural formats is an error.
Paths are relative to the lesson directory; the folder is not scanned for
modules. Every registered module follows the usual [scene exports](#scene-exports).

```markdown
@scene(circle)
@cue(theta = HALF_PI)
The point is above the center.

@scene(cosine)
@cue(theta = PI)
The graph reaches minus one.

@scene(circle)
We return to the earlier circle state.
```

`@scene(id)` selects the registered module at the onset of the next spoken word.
It takes only the scene id; it has no `over` or `at` options.
Local directives (`@cue`, `@show`, `@hide`, `@camera`, `@bake`, and `@track`)
refer to the most recently selected scene in source order,
starting with `initialScene`. Parameter names, presets, constants, groups, and
bakers are independent across scenes. Each scene starts from its own defaults;
revisiting it evaluates its authored tracks at the current lesson time. Cues do
not reset implicitly on entry, and authored transitions can finish while hidden.
Learner overrides clear when leaving a scene or seeking. Values are not copied
between scenes. A module with a local `scene` parameter can still select its
own modes with `@cue(scene = name)`.

Names remain local in script cues and the module API: write `@cue(theta = PI)`,
`ctx.write("theta", value)`, and `state.theta`. Do not add a scene prefix there.

Switching is instantaneous and does not pause audio. The player evaluates the
active module directly from lesson time, including after a seek. All scene code
is included in the initial bundle. The outgoing instance is disposed and the
incoming instance receives a fresh canvas. Scene-owned resources must be cleaned
up in `dispose()`.

Visual anticipation and negative cue offsets are clamped at the preceding scene
entry. A checkpoint immediately before an entry keeps the outgoing scene until
the next clock tick after resume. Board directives remain global and require an
explicit `@clear(board)` when content should not carry across a switch.

`lesson ref --scene <id>` and `lesson scene --scene <id>` select an individual
scene. Without this flag, the reference lists all scenes and standalone preview
uses `initialScene`. `lesson state` and compiled tracks use qualified parameter
names such as `circle.theta` and `cosine.theta`, plus a global `scene` selector.
For example, after building unit-circle:

```bash
pnpm lesson state --lesson lessons/unit-circle --at 5
pnpm lesson state --lesson lessons/unit-circle --at 5 --drag circle.theta=1
```

Times are seconds from the start of the entire lesson, including on return
visits. The state output includes parameters from inactive scenes as well.
Recorded track keys supplied to the compiler use these same qualified names.
The existing version-1 track format and single-scene names remain supported.

An assistant's `commandable` list also uses qualified names. Inside the existing
`assistant` section of the manifest, set:

```yaml
  commandable: [circle.theta, cosine.theta]
```

The assistant receives the active scene and its visible controls; server
validation restricts new writes to that scene's allowlist. It cannot change the
global `scene` selector. Conversation history can retain answers from earlier
scenes, while temporary visual changes and pending answers clear on a switch.
Evaluation state overrides and rubric parameter names also need these prefixes;
see [assistant evaluation authoring](#invite-and-evaluate-questions).

#### Manifest

A single-scene `lesson.yaml` can use the original format:

```yaml
id: unit-circle
title: The unit circle
promise: See how an angle on the unit circle determines its sine and cosine.
tags: [mathematics, trigonometry]
scene: ./scenes/scene.ts
defaults:
  anticipation: -0.2
  ease: inOutCubic
  transition: 1.0
tts:
  provider: elevenlabs
  voice: VOICE_ID
  model: eleven_multilingual_v2
  speed: 0.9
deployment:
  provider: huggingface
  space: example/lesson-space
```

`promise` is the one-sentence public description included in the Hugging Face
Space card prepared by Tangible. It does not appear inside the lesson player.
The start screen shows the title, Start button, interaction guidance, loading
and failure states, and the portrait-phone orientation notice. The framework
shows this content in a translucent card over the initial lesson scene and
prevents scene interaction until narration starts.

The optional `tags` list contains subject terms for Hugging Face discovery.
When Tangible creates a Space card, it removes duplicates and combines these
terms with the automatic `tangible`, `education`, and `interactive-learning`
tags. It also uses the lesson title followed by “a Tangible lesson” as the
Space's short description, shortening the title when necessary to keep the
description within 60 characters. An existing custom Space card remains under
the author's control.

The `tts` section is optional while a lesson is being developed with `--offline`
or `--silent`. A provider-backed preview and deployment require it. When present,
`tts.provider` supports `supertonic`, `elevenlabs`, and `hf-endpoint`.
Supertonic accepts an optional positive `speed` (default 1) and uses its fixed
English voice and pinned model; do not specify `voice` or `model` for it.
ElevenLabs and `hf-endpoint` require a `voice`. ElevenLabs also accepts an optional
`model` and positive `speed`; the provider determines the supported speed range.
The Qwen endpoint accepts an optional non-empty `revision` for cache invalidation,
but selects its model on the server. Its adapter fixes English and generation
settings, which are not configurable in the manifest. See
[narration configuration](#choose-and-configure-narration) for examples and the
endpoint contract. `--offline` replaces provider speech
with the fixed local Supertonic voice, independently of the manifest voice.
`--silent` selects deterministic silent audio instead. The CLI loads gitignored
`.env` files from both the invocation directory and the lesson directory.

Offline and provider-backed builds require ffmpeg. Tangible converts provider
WAV or MP3 output into WebM/Opus and M4A/AAC-LC files, preserving the original
narration timing. The player asks the browser which format it supports and
downloads only that file. Hermetic `--silent` builds retain their small WAV and
do not require ffmpeg.

The local model is stored in the operating system's user cache and shared by
all lessons. Set `TANGIBLE_CACHE_DIR` to choose another Tangible cache root, or
set `TANGIBLE_SUPERTONIC_MODEL_DIR` to an already extracted model directory for
an air-gapped installation. Tangible verifies the archive checksum before
installing it and keeps the model's license file. The Supertonic model uses the
[OpenRAIL-M license](https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE).

Narration never autoplays. The player waits until its audio is ready and begins
only after the visitor presses Start.

`deployment.space` records the stable Hugging Face Space identifier in
`namespace/name` form. It is optional unless `lesson deploy` is used. Do not put
tokens, visibility, hardware, or deployment status in `lesson.yaml`; those are
remote Space settings.

#### Scene exports

- `schema` defines the required parameters.
- `scene` is the runtime scene module.
- `presets` contains optional named parameter collections, including cameras.
- `constants` contains optional named values usable in cues.
- `groups` contains optional ordered parameter lists for compact coupled cues.
- `bakers` contains optional deterministic build-time computations.

Run `pnpm lesson ref --lesson <dir>` for the exact lesson-specific contract.

The runtime module may declare `scene.designSize: { width, height }`, with
positive finite reference dimensions in CSS pixels. This opts into proportional
enlargement with `max(1, min(playerWidth / width, playerHeight / height))`.
The scene and player overlays enlarge together; the assistant drawer stays
outside that composition. Omit the field to retain ordinary CSS sizing.

`ctx.size()` returns `{ width, height, scale, canvasScale }`. Its dimensions
are the available layout rectangle before magnification. `scale` converts its
coordinates to displayed CSS pixels, and `canvasScale` converts them to canvas
backing pixels, including display density. Use `canvasScale` for the canvas
transform and to convert incoming handle coordinates. `ctx.viewport()` still
returns backing-pixel dimensions. Scene preview and the full player use the same
sizing rules, which are reapplied on scene switches. See
[responsive scene layouts](#design-responsive-scene-layouts)
for canvas and HTML examples.

The runtime scene instance renders with `render(state, frame)`. `state` is the
complete visible parameter state. `frame.dt` is the elapsed rendering time, and
`frame.activity` maps currently manipulated parameter names to:

```ts
{
  source: "narration" | "user" | "assistant";
  strength: number; // zero to one
}
```

Animated narration tracks remain active for their complete transition. Instant
changes and completed transitions fade for a short period. User activity remains
active during a drag or scene-control write and then fades. Assistant activity
follows the temporary answer timeline. Scenes choose whether and how to render
this information; the player does not assume that a parameter is represented by
a slider or any other particular interface.

#### Optional assistant

```yaml
assistant:
  provider: huggingface
  model: google/gemma-4-31B-it:cerebras
  context: assistant.md
  startOpen: true
  commandable: [theta, show.projection]
```

The `model` is a Hugging Face router model identifier and may include an
inference-provider suffix. The context describes the scene, controls,
terminology, and answer guidance. Only allowlisted parameters may be returned
by the provider. Assistant-enabled bundles include a same-origin server; other
lessons remain static. See
[the assistant section of the authoring guide](#add-a-lesson-assistant).
`startOpen: true` displays the question field immediately when the viewport has
room. The player keeps the panel collapsed on phone-width or short-landscape
viewports. The field is optional and defaults to `false`.
The optional nested `assistant.limits` block records all request, response,
traffic, queue, and provider-timeout values. See
[Configure assistant limits](#configure-assistant-limits) for the
complete block and its defaults. `lesson check` rejects invalid limit values
before a provider is called.

An optional `assistant.eval.yaml` records model configurations, representative
question sequences, lesson times, state overrides, and repetitions for
`lesson assistant-eval`. It is a review artifact rather than part of the
deployed lesson.

### Narration directives

Narration is Markdown. Prose is spoken verbatim. Front matter, double-bracket
hints, and formal directives are stripped before speech synthesis and captions.
Inline directives anchor to the onset of the next word. Block directives occupy
their own line.

#### State cues

```markdown
@cue(theta = 0)                         instant assignment
@cue(theta -> 3.14, over: 2s)           animated assignment
@cue(theta -> HALF_PI, ease: linear)     named constant and easing
@cue(weights -> [0.1, 0.2, 0.3])        named parameter group
```

Options are `over: <seconds>`,
`ease: linear|inOutCubic|inCubic|outCubic|spring`, and
`at: +0.5s|-0.2s|sentence-end`. Values are absolute and validated against the
scene schema.

Convenience directives are:

```markdown
@show(projection, cosLabel)
@hide(projection)
@camera(sideView, over: 3s)
@camera(target: [0, 0.5, 0], distance: 7, azimuth: -45°, elevation: 30deg)
@camera(azimuth: 45, over: 2s)
```

`@camera` accepts either a named scene preset or inline orbit-camera fields.
The fields are `target: [x, y, z]`, `distance`, `azimuth`, and `elevation`.
`target` contains three numbers and `distance` must be positive. Angles may use
`deg` or `°`; a number without a unit also means degrees.

An inline directive may provide only the fields that change. Missing fields keep
their latest authored values, starting from the camera default in the scene
schema. The compiler resolves every partial directive to a complete camera value
at build time, so it never depends on camera movement made by the learner.

Orbit interpolation follows the shortest path between two viewing directions.
A complete turn therefore needs intermediate camera directives rather than one
directive whose final angle differs from its initial angle by 360 degrees.

#### Structure and pauses

```markdown
@scene(main)
@chapter(Why the path zigzags)
@pause(prompt: "Find where SGD becomes unstable.")
@pause(prompt: "Explore before continuing.", speak: false)
```

`@scene(main)` selects a registered module named `main` when the manifest uses
`scenes`. With the original singular `scene` field, it sets that module's local
`scene` parameter to `main`. See [Multiple scenes](#multiple-scenes) for the
selection, timing, and state rules. `@chapter` adds a timeline marker without
changing the active module.

A spoken pause inserts its prompt into narration and stops at the prompt
boundary. A silent pause stops without adding text. The normal play control
resumes.
Checkpoint times are rounded to the player's hundredth-of-a-second clock so
resuming cannot immediately trigger the same pause again.

#### Board

```markdown
@board(loss: $L = (y - \hat y)^2$)
@board(note: "The update follows the negative gradient.")
@highlight(loss.term)
@dim(loss)
@clear(loss)
@clear(board)
```

Board content belongs to the script rather than the scene schema. The player
renders it as an overlay in the rightmost 28 percent of the player by default.
Scene authors must reserve that area in the visual composition so equations and
notes do not cover important scene content or interactive controls. A lesson may
change the board's bounds with scoped `.xv-board` CSS, but there is currently no
scene export for declaring those bounds.

KaTeX subexpressions are addressed through `\htmlClass{name}{...}` tags.

#### Build-time computation

```markdown
@bake(descent, steps: 3, over: 6s, ease: inOutCubic)
```

The named scene baker receives its declared reads and returns exactly its
declared writes. The compiler validates and expands the result into ordinary
keyframes. Repeat one-step bakes when each update needs a separate narration
anchor.

#### Natural-language hints

Double brackets let a human describe choreography before the scene contract is
known:

```markdown
[[Reveal the projection as the narrator says "horizontal".]]
```

The implementing agent translates these hints into formal syntax.
