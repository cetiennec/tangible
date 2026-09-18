// Select the configured narration independently of the local assistant mode.

import type { TtsAdapter } from "@tangible/core";
import { FakeTtsAdapter, ElevenLabsAdapter, HuggingFaceVoiceAdapter, SupertonicTtsAdapter } from "@tangible/tts";
import type { Manifest } from "./manifest.js";

export type NarrationMode = "provider" | "offline" | "silent";

export function selectNarration(
  manifest: Pick<Manifest, "tts" | "offlineTts">,
  mode: NarrationMode,
  requireProduction = false,
): { adapter: TtsAdapter; voice: string; speed?: number } {
  if (requireProduction && mode !== "provider") {
    throw new Error("lesson deploy requires the configured production voice; omit --offline and --silent");
  }
  const config = manifest.tts;
  if (mode === "silent") {
    return { adapter: new FakeTtsAdapter(), voice: config && "voice" in config ? config.voice : "draft" };
  }
  if (mode === "offline" || config?.provider === "supertonic") {
    console.error("narration: Supertonic generates speech locally; word timing is estimated within each sentence. Review cue placement before publishing.");
    return {
      adapter: new SupertonicTtsAdapter({ onStatus: (message) => console.error(message) }),
      voice: "supertonic-3-speaker-0",
      speed: mode === "offline" ? manifest.offlineTts?.speed ?? 1
        : config?.provider === "supertonic" ? config.speed ?? 1 : 1,
    };
  }
  if (!config) {
    throw new Error('narration requires a "tts" section in lesson.yaml; choose a provider or use --offline or --silent while drafting');
  }
  if (config.provider === "hf-endpoint") {
    if (!process.env.TTS_ENDPOINT_URL) throw new Error("TTS_ENDPOINT_URL is not set");
    if (!(process.env.HF_TTS_TOKEN ?? process.env.HF_TOKEN)) throw new Error("HF_TTS_TOKEN or HF_TOKEN is not set");
    return {
      adapter: new HuggingFaceVoiceAdapter({
        speaker: config.voice,
        revision: config.revision,
        onStatus: (message) => console.error(message),
      }),
      voice: config.voice,
    };
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not set; configure the key or use --offline or --silent while drafting");
  }
  return { adapter: new ElevenLabsAdapter({ modelId: config.model }), voice: config.voice, speed: config.speed };
}
