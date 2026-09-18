# Contributing to Tangible

Thank you for helping improve Tangible. The repository has two related
workstreams, and each has its own detailed guidance.

## Create or improve a lesson

Read [lessons/AGENTS.md](./lessons/AGENTS.md) and the
[authoring guide](./DOCUMENTATION.md). The human author owns the teaching
argument, spoken narration, and final pedagogical and visual judgment. Lesson
changes should use the smallest scene that makes the intended relationship
visible and should be reviewed without paid providers before production voice
or deployment work begins.

## Change the framework

Read [packages/AGENTS.md](./packages/AGENTS.md) and the framework guidance below.
Framework changes must preserve deterministic value-at-time evaluation, package
boundaries, and the separation between browser code and provider credentials.

## Before submitting a change

Keep each commit focused and preserve unrelated work. Run checks in proportion
to the change:

```bash
pnpm check
```

Run `pnpm test:e2e` when changing the player, browser interaction, bundling, or
the complete authoring workflow. Use silent or offline providers in automated
tests. Do not commit lesson `build/` or `.cache/` directories, credentials, or
generated evaluation results.

## Setup

Prerequisites are Node 22 or newer and pnpm. Install ffmpeg for offline or
provider-backed narration builds. Hermetic `--silent` builds do not require it.

```bash
pnpm install
pnpm build
pnpm check
pnpm test:e2e
```

`pnpm check` runs TypeScript compilation, ESLint, package-boundary checks, and
unit tests. The end-to-end suite uses local provider substitutes and requires no
credentials.

## Repository layout

```text
packages/        framework packages
lessons/         lesson sources and integration examples
docs/assets/     images used by the README
DOCUMENTATION.md  authoring workflow and reference
CONTRIBUTING.md   contributor guidance and development plans
e2e/             browser integration tests
```

## Architecture

Tangible has three layers:

```text
script.md ─────────┐
                   ├─ compiler ─► audio + tracks.json + captions.vtt
scene module(s) ───┘                         │
                                            ▼
                    player: audio clock ► state ◄ learner interaction
                                                    │
                                                    ▼
                                     scene render = f(state, activity)
```

The authoring format and scene schema are compiler inputs. The compiler validates
them, resolves narration-relative cues, and emits static tracks. The browser
player consumes the built artifacts and scene bundle. It does not parse scripts
or call speech providers. The player also owns the standard loading and start
experience, including the inactive scene preview behind its translucent card;
lessons contribute only their title to that screen.

During scene development, the CLI bundles the selected scene module directly into a
browser preview. This path initializes state from schema defaults and uses the
player package's scene host and interaction code. It does not construct a lesson
player or involve scripts, tracks, audio, or providers.

Multiple-scene lessons register modules in the manifest. The compiler partitions
local directives by scene before validation and expansion, then qualifies their
tracks and combines them with a common scene selector and board timeline. The
player presents local names to each module and switches instances from the
evaluated selector. Existing single-scene manifests and parameter names keep
their original meaning. See [multiple scenes](./DOCUMENTATION.md#multiple-scenes)
for the authoring and lifecycle contract.

## Package boundaries

- `core` contains schemas, types, interpolation, easing, and reconciliation
  mathematics. It depends on nothing.
- `compiler` contains parsing, validation, authored-state evaluation, timing
  resolution, track expansion, and artifact emission.
- `tts` contains the local Supertonic voice, the silent test substitute,
  ElevenLabs, and private endpoint adapters.
- `player` contains the clock, state composition, interaction, board, captions,
  and playback controls.
- `ingredients` contains reusable scene helpers.
- `cli` is the composition root and may depend on every framework package.

`compiler`, `tts`, `player`, and `ingredients` may depend only on `core`. The
player never imports the compiler, speech providers, or authored scripts. These
rules are enforced by `scripts/check-boundaries.mjs`.

## Invariants

Violations of these rules are bugs:

1. **Value at time.** Every authored parameter can be evaluated directly at
   lesson time `t`. Playback never needs to replay history from zero.
2. **Text-owned source.** Authored state is stored in readable, diffable text.
   Generated artifacts are JSON, VTT, JavaScript, HTML, and audio. Real TTS
   audio is delivered as WebM/Opus with an M4A/AAC-LC fallback; the browser
   downloads only one supported encoding.
3. **Deterministic builds.** The same authored inputs and cached provider results
   produce byte-identical outputs.
4. **Compiler-led feedback.** `lesson check` finds authoring errors without
   provider calls and reports useful source locations.
5. **Framework-free hot path.** The animation loop works on plain state. Signals
   are used at DOM boundaries, not as a per-frame rendering framework.

Narration parameter activity is also evaluated directly at lesson time. It does
not depend on differences between consecutive frames, so seeking into a
transition reproduces the same emphasis and seeking past one does not create a
false change. Scenes own the visual treatment and may ignore activity for
parameters that have no visible representation.

## Parameter ownership

- `script` values temporarily yield to learner interaction and then glide back
  to the narration timeline.
- `shared` values preserve a learner change until the next scripted write.
- `viewer` values stop following the script after learner interaction during the
  current session. Cameras normally use this mode.

Pausing freezes modified values. Resuming gives `script` values a fresh
playback-time hold. Seeking clears interaction state. Assistant commands are a
temporary display overlay, not another ownership mode.

## Build-time computation

Scene-exported bakers may compute coupled processes such as optimizer steps.
`@bake` runs during checking and compilation and turns absolute outputs into
ordinary tracks. Baker code never runs in the player.

## Assistant boundary

An optional same-origin lesson server sends one request to a written-answer
provider. It assembles one system message with numbered Markdown instruction
sections from the authored assistant guide, lesson narration, a compact
scene-control contract, and answer rules. XML tags delimit the generated lesson
narration, its chapters, its spoken prose, and supporting context. The prompt
preserves useful literal settings, board material, and silent activity prompts
without exposing raw authoring directives, presets, constants, or groups.

The current user message contains a semantic lesson position, visible scene
state, and provenance for values temporarily left by the preceding answer. The
position includes only the latest chapter, current or most recent narration cue,
and active pause prompt. It never reveals future narration. Up to the lesson's
configured number of successful page-local turns precede the current message,
and the server does not persist this history.

The provider receives no tools. A strict JSON schema and server validation bound
the returned written beats and allowlisted absolute scene values. Provider
credentials remain on the server. The temporary answer timeline disappears when
playback resumes or another question begins.

The server admits provider calls through a bounded first-in, first-out queue.
Hourly and daily budgets count calls when they start, while browser and IP
limits prevent one visitor from filling the queue. Structured operational logs
record effective limits, traffic counts, queue waits, latency, safe error
categories, and provider token usage when available. They never record prompts,
questions, answers, credentials, browser identifiers, or raw IP addresses.

## Working conventions

- Preserve the invariants above.
- Keep package dependencies within the enforced boundaries.
- Prefer direct, readable implementations over new abstraction layers.
- Add tests for behavior that is correctness-critical or difficult to inspect.
- Keep scene schemas loadable without a DOM.
- Keep provider credentials out of browser bundles.
- Use a real lesson to validate changes to the authoring contract.
- Update [DOCUMENTATION.md](./DOCUMENTATION.md) when author-facing behavior changes.
- Follow the [TTS improvement plan](#tts-improvement-plan) for narration work.

Run `pnpm boundaries` after dependency changes. Run `pnpm check` for every
framework change. Run `pnpm test:e2e` when changing the player, bundling, browser
interaction, or end-to-end authoring behavior.

## Provider credentials

Real narration and live assistant calls are optional. Store credentials in a
gitignored root or lesson-local `.env` file:

```text
ELEVENLABS_API_KEY=...
HF_TOKEN=...
TTS_ENDPOINT_URL=...
HF_TTS_TOKEN=...
```

Never use real providers in automated tests or continuous integration.

## Continuous integration

The GitHub Actions workflow runs type checks, lint rules, dependency checks,
unit tests, and browser tests for every pull request and every push to the main
branch. It does not deploy lessons or call paid providers. Browser tests use
placeholder audio and run in Chromium and WebKit on Linux.

This catches integration failures across compilation, generated artifacts,
browser playback, seeking, interaction, and assistant requests. It also tests in
an environment different from the author's development machine.

## TTS improvement plan

The following five steps were agreed in September 2026. Step 1 documents the
current implementation. Steps 2–5 remain planned; their configuration examples
and features must not be presented as available until implemented.

1. **Explain the existing narration options.** This step is complete. The
   [narration section](./DOCUMENTATION.md#choose-and-configure-narration) covers
   local synthesis, hosted providers, built-in and cloned voices, timing,
   caching, credentials, and the current Qwen endpoint contract. The README
   provides the first-lesson walkthrough, and `DOCUMENTATION.md` combines the
   authoring guide with the reference appendix.
2. **Make local production and timing explicit.** Allow Supertonic as a normal
   manifest provider and permit its use in deployment. Preserve `--offline` as
   a development shortcut. Record the origin and precision of timing, evaluate
   optional forced alignment for audio-only models, fix cache identity and
   missing-credential behavior, and make language explicit with English as the
   default. Check the wider lesson assumptions before claiming French support.
3. **Publish a reproducible Qwen tutorial and server example.** Recover the
   author's existing serving and training implementation first. Explain
   reference-recording cloning separately from optional fine-tuning. Cover
   recording preparation, transcripts, model choice, evaluation, model upload,
   a versioned server that runs locally and on a Hugging Face Inference Endpoint,
   hardware requirements, cold starts, scaling, credentials, and a first lesson
   build. Preserve existing `hf-endpoint` configurations.
4. **Add Gradium as the first new hosted provider.** Use its audio and timestamped
   text response, map timing back to the original narration, and validate
   numbers, abbreviations, and pronunciation changes. Consider Cartesia next
   when a concrete voice or language need justifies it; avoid adding providers
   solely to lengthen the supported list.
5. **Evaluate Kokoro before integrating it.** Compare it with Supertonic for
   ordinary local narration and verify the selected runtime's language coverage,
   especially French. Use the Qwen server example for local cloning first.
   Include Chatterbox in listening comparisons if useful without committing to
   another adapter in advance.

Evaluate candidates with the same short scientific passages. Compare
pronunciation, phrasing, omitted or repeated words, cue accuracy, generation
time, memory use, and cost. Use local provider substitutes in automated tests,
run `pnpm check` for implementation changes, and validate affected authoring
and deployment workflows against a real lesson.
