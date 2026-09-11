# Authoring a lesson

If this is your first lesson, begin with the shorter
[creator quick start](./quickstart.md). This guide remains the complete workflow
and design reference for production lessons.

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

The standard player adds a small “Made with Tangible” link at the right end of
the playback controls. Scenes must not reproduce or position this link. If a
scene changes the colors of the player controls, keep `.xv-credit` readable and
preserve its visible keyboard focus indicator.

The exact file format and scene exports are described in
[the reference](./reference.md#lesson-files-and-manifest).

## Add another scene

The [unit-circle lesson](../lessons/unit-circle/script.md) is a working example:
it moves from a circle to a cosine graph, then returns to the circle. The lesson
keeps one script, voice, caption timeline, board, and optional assistant guide.
Each scene supplies its own rendering, controls, and parameter schema.

### Register the scene files

Keep the existing `scenes/scene.ts` and add a second module, such as
`scenes/cosine.ts`. Both files export the same [scene contract](#scene-contract).
The example's [circle module](../lessons/unit-circle/scenes/scene.ts) and
[graph module](../lessons/unit-circle/scenes/cosine.ts) each expose an independent
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
[reference](./reference.md#multiple-scenes) for naming rules.

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
[the reference](./reference.md#narration-directives).

## Review and tune the lesson

Use an offline preview while the prose and cue order are changing:

```bash
pnpm lesson preview --offline --lesson lessons/my-lesson
```

The preview remains running when a script or scene edit contains an error. It
shows the compiler diagnostic on a red page and reloads the lesson automatically
after the source is corrected. `lesson check`, `lesson build`, and deployment
still stop on invalid source.

Offline mode does not call a speech or answer provider. It synthesizes the
narration locally with the quantized Supertonic 3 model and uses a local
substitute for assistant answers. The first offline build downloads a pinned
123 MB model archive; subsequent builds use the shared local copy. Tangible also
caches the generated audio inside the lesson, so cue-only edits do not run the
model again.

Set the local voice speed in `lesson.yaml` when the draft narration needs a
different pace:

```yaml
offlineTts:
  speed: 1.2
```

The default is 1; 1.2 requests speech 20 percent faster. The value must be
positive. This setting applies only to `--offline`, and changing it generates
new local audio with matching cue and caption timings. It does not change the
production provider settings or the silent test clock.

Install ffmpeg before an offline or provider-backed narration build. Tangible
automatically converts the TTS provider's WAV or MP3 result into WebM/Opus at
64 kbps and M4A/AAC-LC at 96 kbps. A browser checks both formats and downloads
only one supported file. This keeps a five-minute narration near 2.4 MB with
Opus or 3.6 MB with AAC instead of shipping the source WAV. The conversion does
not change the compiler's timing. `--silent` keeps its deterministic WAV and
does not require ffmpeg.

The local voice is fast enough for prose and cue iteration, but it does not
provide word alignment. Tangible estimates character timing within each
sentence. Treat this timing as a useful draft and make the final timing pass
against the production voice. Use `--silent` when an automated test or a
strictly hermetic build needs the former predictable silent clock instead.

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

For a Hugging Face voice endpoint, Tangible waits up to ten minutes for an
endpoint that has scaled to zero to become ready. The build reports this wait
and then prints progress for every narration segment. Cached narration does not
contact or wake the endpoint.

Tune cue offsets against the real prosody without changing the teaching
argument. Provider results are cached, so changing cues without changing spoken
prose does not synthesize the narration again.

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
[optimizers guide](../lessons/optimizers/assistant.md) is a concise example for a
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
[unit-circle evaluation cases](../lessons/unit-circle/assistant.eval.yaml).

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

Use `--offline` only for local review. A release bundle must contain the
intended production narration.

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
