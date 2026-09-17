# Qwen3-TTS voice endpoint

Serves Qwen3-TTS behind the two routes Tangible's `hf-endpoint` voice provider
expects, so a lesson can be built with a cloned voice instead of a paid service.

The endpoint is only needed **while a lesson is being built**. Narration is
baked into `audio.webm` and `audio.m4a` and shipped with the lesson, and the
deployed Space never calls a voice model. Run the endpoint for the few minutes a
build takes, and let it scale back to zero afterwards.

## The contract

| route | expects | returns |
|---|---|---|
| `GET /health` | — | 200 once the weights are loaded |
| `POST /generate` | `{text, language, speaker, seed, temperature, top_p}` | mono 16-bit PCM WAV |

The provider measures each segment's length from the WAV byte count, so the
audio must be uncompressed 16-bit PCM. `app.py` converts the model's float
output accordingly; nothing else will be accepted.

## Two checkpoints, two jobs

Qwen ships separate checkpoints and each one refuses the other's method, so the
checkpoint you load decides what the endpoint can do.

| checkpoint | method | what it does |
|---|---|---|
| `…-1.7B-CustomVoice` | `generate_custom_voice` | speaks in one of nine built-in timbres |
| `…-1.7B-Base` | `generate_voice_clone` | imitates a three-second recording |
| `…-1.7B-VoiceDesign` | `generate_voice_design` | invents a voice from a written description |

`CustomVoice` is loaded by default, which is why narration can be built before
anyone records anything. Its two English timbres are **Aiden**, described as a
sunny American male voice with a clear midrange, and **Ryan**, described as a
dynamic male voice with strong rhythmic drive. The rest are Chinese (Vivian,
Serena, Uncle_Fu, Dylan, Eric), Japanese (Ono_Anna) and Korean (Sohee). Call
`model.get_supported_speakers()` for the current list.

## Choosing a voice

`speakers/speakers.json` names the voices a lesson may ask for. An entry naming
a `speaker` is a built-in timbre and needs the `CustomVoice` checkpoint; an
entry naming `ref_audio` is a clone and needs `Base`. The app reads the entry
and calls the matching method:

```json
{
  "aiden": { "speaker": "Aiden" },
  "ryan": { "speaker": "Ryan", "instruct": "Speak calmly, like a patient teacher." },
  "etienne": { "ref_audio": "speakers/etienne.wav", "ref_text": "Exactly what is said in the clip." }
}
```

The optional `instruct` field steers tone and pace in plain language, and only
`CustomVoice` reads it. Ask for a voice by its key, through `voice:` in
`lesson.yaml`.

## Switching to your own voice later

Record roughly three seconds of clean speech, add an entry with `ref_audio` and
a `ref_text` matching the recording word for word, and set the Space variable
`QWEN_TTS_MODEL` to `Qwen/Qwen3-TTS-12Hz-1.7B-Base`. Paths may be local files in
this directory, URLs, or base64. Nothing else changes.

Asking for a clone while `CustomVoice` is loaded, or a built-in timbre while
`Base` is loaded, returns **409** naming the checkpoint you need rather than an
unexplained failure.

## Build and push

```bash
cd tools/qwen-tts-endpoint
docker build -t qwen-tts-endpoint .
hf repos create <namespace>/qwen-tts-endpoint --type model
# push the image to your registry of choice, then point an Inference Endpoint at it
```

## Why the Space is public, and how the voice stays protected

A private Space is reached only through a signed browser URL. Requests carrying
an ordinary bearer token never reach the container, so a private Space cannot be
called as an API at all. The Space is therefore public and the guarding happens
in the app:

1. Set `ENDPOINT_TOKEN` as a **Space secret** — any long random string.
2. Put the same string in the lesson's `.env` as `HF_TTS_TOKEN`.

The app then refuses every request whose bearer does not match. The code is
public; the voice is not, and nobody who finds the address can make it speak.

Keep reference recordings out of the public Space. Either mount them from a
private dataset the Space reads with its own token, or use a URL only the Space
knows.

## Option B: an Inference Endpoint, which stays private

Endpoints are built to be called as APIs, so unlike a Space they are private and
token-authenticated at once. Hugging Face's own custom-container guide uses the
same two routes this app serves, so the shape is already right. The cost is that
the image must reach a registry Endpoints can pull from — Docker Hub, Amazon
ECR, Azure ACR or Google GCR. The Spaces registry is not one of them.

```bash
# On an x86 machine, or on a Mac with emulation, which is slow for a CUDA image.
docker build --platform linux/amd64 -t <dockerhub-user>/qwen-tts-endpoint:v1 tools/qwen-tts-endpoint
docker push <dockerhub-user>/qwen-tts-endpoint:v1
```

Then at https://endpoints.huggingface.co: **Deploy**, choose
`Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` as the model, pick GPU hardware, and
under **Custom Container** give the image URL and port **7860**. Set the
endpoint to scale to zero after a few idle minutes.

The chosen model is mounted at `/repository`, and this app loads from there when
that directory exists, so nothing is downloaded at start-up and cold starts are
shorter. Point the lesson at the endpoint URL, with your Hugging Face token as
`HF_TTS_TOKEN`.

## Create the endpoint

Create a Hugging Face Inference Endpoint from the image, on a GPU instance, and
set **scale to zero after a few minutes of inactivity**. The provider sends an
`x-scale-up-timeout` header and waits up to ten minutes on `/health`, so a cold
start is expected and handled.

Qwen3-TTS needs CUDA. It will not run on Apple Silicon, and ZeroGPU cannot serve
it because ZeroGPU only supports the Gradio SDK, not custom HTTP routes.

## Point the lesson at it

In the lesson's gitignored `.env`:

```
TTS_ENDPOINT_URL=https://<your-endpoint>.endpoints.huggingface.cloud
HF_TTS_TOKEN=<a token that may call the endpoint>
```

And in `lesson.yaml`:

```yaml
tts:
  provider: hf-endpoint
  voice: etienne
```

Then `pnpm lesson build --lesson lessons/<id>` without `--offline`. Keep these
values out of the repository and out of Space variables: they are build-time
credentials and must never reach a release artifact.

## Settings worth knowing

| variable | default | purpose |
|---|---|---|
| `QWEN_TTS_MODEL` | `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | the checkpoint to load |
| `QWEN_TTS_ATTENTION` | `sdpa` | set to `flash_attention_2` if the image has it built |
| `QWEN_TTS_SPEAKER` | `aiden` | used when a request names no speaker |
| `QWEN_TTS_SPEAKERS` | `speakers/speakers.json` | where the voices are listed |

The provider sends a different seed per segment and the same seeds on a rebuild,
so an unchanged script re-synthesises to the same audio.
