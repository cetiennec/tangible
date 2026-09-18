# Clone your voice with Qwen3-TTS and use it in Tangible

This guide explains how to turn recordings of your voice into a speech service
on a Hugging Face Inference Endpoint, then use that service to narrate a
Tangible lesson. It gives you the main decisions and steps to carry out with
a coding agent.

You will need recordings and transcripts, access to a CUDA GPU for the model,
and a Hugging Face account with billing enabled for endpoint hosting. The
official Qwen and Hugging Face guides linked below provide implementation
details. Tangible supplies the client that calls the speech service; you or
your agent must prepare the model and server.

## Understand the workflow

There are two ways to clone a voice:

| Approach | What you provide | What happens |
| --- | --- | --- |
| Reference recording, also called zero-shot cloning | You provide a short recording and its exact transcript. | The existing model uses the recording as an example when generating new speech. No training is required. |
| Fine-tuning | You provide a reviewed collection of recordings and transcripts. | Training updates the model weights and produces a checkpoint with your named speaker. |

Start by listening to a reference-based clone. Fine-tuning is an optional next
step if that result is insufficient.

The complete path is:

```text
Recordings and transcripts → voice evaluation → optional fine-tuning
    → model files on the Hugging Face Hub → GPU endpoint running a speech server
    → generated WAV files → Tangible lesson build
```

The Hub repository stores model files. The endpoint runs them on a GPU and
accepts text over HTTP. A Hugging Face Space hosts the finished lesson; it is
a separate service. Tangible generates narration during the build, so learners
do not need the speech endpoint to remain running.

## 1. Prepare recordings and try a reference clone

Choose a clean passage in your normal speaking style, without music, another
speaker, clipping, or strong background noise. An 8–15 second passage is a
practical starting point. Write a transcript that matches the recording exactly,
including any differences from the original script.

Use `Qwen/Qwen3-TTS-12Hz-1.7B-Base` for the reference clone. The smaller
`0.6B-Base` is another option. The pretrained `CustomVoice` models contain
provided speakers, while `VoiceDesign` creates a voice from a description;
select a `Base` model to clone your recording. In an isolated Python 3.12
environment managed with `uv`, follow the official
[Qwen voice-cloning example](https://github.com/QwenLM/Qwen3-TTS#voice-clone).
The agent should load the model, call `generate_voice_clone` with `ref_audio`
and `ref_text`, and save the returned waveform. It can reuse a reference with
`create_voice_clone_prompt`.

Test several short passages with scientific terms, names, numbers, and ordinary
explanation. Listen for voice resemblance, pronunciation, missing or repeated
words, and natural rhythm. Test the language you intend to publish: a convincing
French clone does not establish that its English output is suitable.

If this is good enough, skip training. Your server will load the Base model
and a private reference recording and transcript, then call
`generate_voice_clone`. A server for a fine-tuned speaker instead calls
`generate_custom_voice` on the selected checkpoint. Both can expose the same
HTTP interface to Tangible.

## 2. Fine-tune if needed

Fine-tuning requires a reviewed dataset and a separate training run:

1. Collect source recordings and their scripts. As a planning target, allow
   one to two hours of candidate speech so you can discard unsuitable clips
   and retain tens of minutes of clean material. This is not a fixed Qwen
   requirement; quality and coverage matter more than a duration target.
2. Extract 24 kHz mono, 16-bit PCM audio and split it into short utterances.
   You can start with clips of roughly two to twenty seconds.
   Remove jingles and unsuitable audio.
3. Use automatic speech recognition to draft transcripts, then review the clips
   and correct the words. A shooting script is only a starting point.
4. Separate training, validation, and test material by recording session or
   independent source section. Freeze the accepted files and transcripts so
   evaluation remains independent of training.
5. Encode the audio with `Qwen/Qwen3-TTS-Tokenizer-12Hz`, run a small training
   test, and then fine-tune the Base model. Choose your speaker identifier,
   such as `my_voice_v1`, before training.
6. Compare the reference clone with the saved checkpoints on the same unseen
   passages. Choose by listening as well as transcription and pronunciation
   checks; the final checkpoint is not automatically the best one.

Training needs more GPU memory than serving the finished model. Ask the agent
to size the training job for your hardware and run a short test before the full
job. Pin the Qwen code, base model, tokenizer, and Python dependencies together.
See the
[official fine-tuning recipe](https://github.com/QwenLM/Qwen3-TTS/tree/main/finetuning)
for the expected data and training commands.

## 3. Package the selected voice and server

You need two separate artifacts: a private model repository containing the
model files, and a Docker image containing the server and its dependencies.
For fine-tuning, upload the complete selected checkpoint and tokenizer. For
reference cloning, package the Base model, tokenizer, reference audio, and
transcript so the server can load them together. Keep voice recordings,
weights, and credentials out of the container image.

Ask the agent to build a small Python server, for example with FastAPI, that:

1. Loads the model once at startup and prepares the reference prompt or named
   speaker.
2. Returns success from `GET /health` only when it is ready.
3. Accepts `POST /generate` with `text`, `language`, `speaker`, `seed`,
   `temperature`, and `top_p`, and returns raw 16-bit PCM WAV audio.
4. Processes one generation at a time on a single GPU and limits request length
   to keep memory use predictable.

For reference cloning, map a speaker identifier such as `my_voice_v1` to the
stored reference. For fine-tuning, use the identifier registered during
training. Follow the [Tangible HTTP contract](../DOCUMENTATION.md#connect-a-compatible-qwen-endpoint)
so the existing adapter can call your server.

Use `uv` for Python installation and execution, and `hf auth login` for Hub
authentication. The setup token needs permission to upload the model and
manage endpoints. Upload the model files to a private Hub repository with
`hf upload`, and record its full commit revision.

Build the container for `linux/amd64`, publish it to a registry Hugging Face
can access, and record its image digest. A public image is suitable if it
contains only code and dependencies. Test the container on a CUDA GPU with the
model files mounted at `/repository`; `/health` should succeed and `/generate`
should produce playable audio before deployment. Bind local tests to localhost
if the server relies on Hugging Face to authenticate requests in production.

## 4. Create the Hugging Face endpoint

Create a custom-container Inference Endpoint in the dashboard or with the
Hugging Face CLI. Hugging Face mounts the selected model repository
at `/repository`; configure the server to read that directory. See the
[custom-container guide](https://huggingface.co/docs/inference-endpoints/engines/custom_container).

Use these settings as a starting point:

| Setting | Value or decision |
| --- | --- |
| Model and container | Select the private model at its full commit revision and the container at its image digest. |
| GPU | Start by testing one NVIDIA L4 with 24 GB memory for the 1.7B model. Confirm memory use and availability in your chosen region. |
| Server | Match the container's listening port, for example `8000`, and use `/health` as the health route. Load model files from `/repository`. |
| Inference | Configure the server to use CUDA, BF16 precision, and a compatible attention backend such as PyTorch SDPA. Run one worker and one generation at a time. |
| Speaker | Configure the named speaker or stored reference associated with `my_voice_v1`. |
| Replicas | For occasional batches, start with one minimum and one maximum replica and explicit pause and resume. |
| Access | Select private access for your account or organization and require an authorized Hugging Face token. |

The current [endpoint configuration guide](https://huggingface.co/docs/inference-endpoints/guides/configuration#authentication)
distinguishes private access from “Authenticated”, which allows any Hugging
Face account with a token. Keep the model repository private as well.

Check the [current price](https://huggingface.co/docs/inference-endpoints/pricing)
before creating the endpoint. Startup can take several minutes while files are
loaded and the GPU becomes ready. Inspect the logs if `/health` fails. For a
memory error, reduce the workload or select a larger GPU; for unavailable
hardware, select another region or provider.

## 5. Generate and review a first audio file

Resume the endpoint and wait until it is ready. Set `TTS_ENDPOINT_URL` to its
base URL without `/generate`, and provide `HF_TTS_TOKEN` through your local
environment. From a trusted machine, send:

```bash
curl --fail-with-body --max-time 900 \
  "$TTS_ENDPOINT_URL/generate" \
  -H "Authorization: Bearer $HF_TTS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: audio/wav' \
  --data '{"text":"A gradient points in the direction of steepest increase.","language":"English","speaker":"my_voice_v1","seed":20260717,"temperature":0.9,"top_p":0.95}' \
  --output speech.wav
```

Replace `my_voice_v1` with the actual speaker identifier. A successful response
is raw 16-bit PCM WAV audio. Use short passages within your server's request
limit and listen for errors before generating a complete lesson.
For another application, call this API from its backend and keep the token
in the server's secret store.

For occasional builds, resume the endpoint, generate your batch, then pause
it through the dashboard or CLI and verify its status. Raw HTTP generation
calls and Tangible do not pause the endpoint automatically.
A [paused endpoint](https://huggingface.co/docs/inference-endpoints/guides/pause_endpoint)
keeps its URL and is not billed until resumed. A warm replica continues to
incur compute charges even when nobody is generating speech.

Automatic [scaling to zero](https://huggingface.co/docs/inference-endpoints/guides/autoscaling)
is another operating mode, with a cold start on the next request. It is distinct
from explicitly pausing an endpoint, which requires a management action to
resume. Choose the operating mode according to how often you generate speech
and how much startup delay you can accept.

## 6. Use the voice in Tangible

In your lesson's `lesson.yaml`, add:

```yaml
tts:
  provider: hf-endpoint
  voice: my_voice_v1
  revision: your-full-model-commit-sha
```

In a gitignored root or lesson-local `.env` file, add:

```dotenv
TTS_ENDPOINT_URL=https://your-endpoint.endpoints.huggingface.cloud
HF_TTS_TOKEN=your_endpoint_access_token
```

Install FFmpeg, resume the endpoint, and run these commands from Tangible:

```bash
pnpm lesson check --lesson lessons/my-lesson
pnpm lesson build --bundle --lesson lessons/my-lesson
pnpm lesson serve --lesson lessons/my-lesson
```

Review the voice, captions, and visual cues. Tangible currently sends
`language: English`. It generates clips at sentence and cue boundaries, but
word timing within each clip remains approximate. The endpoint must implement
the [Tangible HTTP contract](../DOCUMENTATION.md#connect-a-compatible-qwen-endpoint);
a generic Hugging Face TTS endpoint is not automatically compatible.

The `revision` field identifies the voice version for Tangible's audio cache;
it does not deploy or select model weights. Update it when you change the
served model, or the reference recording in a reference-based server. Cached
audio is reused when its inputs are unchanged. Once the build finishes, pause
the endpoint. The finished lesson plays its generated audio without endpoint
credentials. See the [narration guide](../DOCUMENTATION.md#choose-and-configure-narration)
for the complete configuration and caching behavior.

## Hand this to an agent

Replace the bracketed text and provide this guide with the request:

> Help me create a Qwen3-TTS clone of my voice for Tangible. My recordings are
> at [path], and I want narration in [language] with [desired speaking style].
> Start with a reference clone and prepare listening samples. Follow this
> guide and the linked official Qwen and Hugging Face documentation.
> If fine-tuning is needed, prepare and review the dataset before training.
> My GPU environment is [local GPU, cluster, or cloud], my Hugging Face
> namespace is [namespace], and my compute budget is [budget]. Package the
> selected voice and a compatible server, pin their versions, and deploy a
> private endpoint for [occasional builds or continuous service]. Connect it
> to [lesson path], verify an audio request and a lesson build, and document
> how to resume and pause it. Keep credentials out of Git and browser code.
> Return the listening samples, model revision, container digest, endpoint
> configuration, and final operating status.
