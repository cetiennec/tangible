import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheKey } from "@tangible/compiler";
import { selectNarration } from "./narration.js";

beforeEach(() => {
  for (const name of ["ELEVENLABS_API_KEY", "TTS_ENDPOINT_URL", "HF_TTS_TOKEN", "HF_TOKEN"]) vi.stubEnv(name, "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("narration selection", () => {
  it("allows local production without credentials and keeps offline speed independent", () => {
    const manifest = { tts: { provider: "supertonic" as const, speed: 0.9 }, offlineTts: { speed: 1.2 } };
    const production = selectNarration(manifest, "provider", true);
    const offline = selectNarration(manifest, "offline");
    expect(production.adapter.id).toBe("supertonic");
    expect(production.speed).toBe(0.9);
    expect(offline.speed).toBe(1.2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("word timing is estimated"));
    expect(cacheKey(production.adapter, production.voice, "text", production.speed))
      .not.toBe(cacheKey(offline.adapter, offline.voice, "text", offline.speed));
    const same = selectNarration({ tts: { provider: "supertonic" }, offlineTts: { speed: 0.9 } }, "offline");
    expect(cacheKey(production.adapter, production.voice, "text", production.speed))
      .toBe(cacheKey(same.adapter, same.voice, "text", same.speed));
  });

  it("uses the same cache for implicit and explicit normal local speed", () => {
    const production = selectNarration({ tts: { provider: "supertonic", speed: 1 } }, "provider");
    const offline = selectNarration({}, "offline");
    expect(cacheKey(production.adapter, production.voice, "text", production.speed))
      .toBe(cacheKey(offline.adapter, offline.voice, "text", offline.speed));
  });

  it("fails clearly for missing provider configuration or credentials", () => {
    expect(() => selectNarration({}, "provider")).toThrow('"tts" section');
    const eleven = { tts: { provider: "elevenlabs" as const, voice: "test" } };
    expect(() => selectNarration(eleven, "provider")).toThrow("ELEVENLABS_API_KEY is not set");
    const hf = { tts: { provider: "hf-endpoint" as const, voice: "test" } };
    expect(() => selectNarration(hf, "provider")).toThrow("TTS_ENDPOINT_URL is not set");
    vi.stubEnv("TTS_ENDPOINT_URL", "https://voice.example");
    expect(() => selectNarration(hf, "provider")).toThrow("HF_TTS_TOKEN or HF_TOKEN is not set");
    vi.stubEnv("HF_TTS_TOKEN", undefined);
    vi.stubEnv("HF_TOKEN", "test-token");
    expect(selectNarration(hf, "provider").adapter.id).toBe("hf-endpoint");
  });

  it("keeps draft overrides available but refuses them for a release", () => {
    const manifest = { tts: { provider: "elevenlabs" as const, voice: "test" } };
    expect(selectNarration(manifest, "offline").adapter.id).toBe("supertonic");
    expect(selectNarration(manifest, "silent").adapter.id).toBe("fake");
    for (const mode of ["offline", "silent"] as const) {
      expect(() => selectNarration(manifest, mode, true)).toThrow("configured production voice");
    }
  });

  it("includes the endpoint revision in the configured cache identity", () => {
    vi.stubEnv("TTS_ENDPOINT_URL", "https://voice.example");
    vi.stubEnv("HF_TTS_TOKEN", "test-token");
    const first = selectNarration({ tts: { provider: "hf-endpoint", voice: "test", revision: "v1" } }, "provider");
    const second = selectNarration({ tts: { provider: "hf-endpoint", voice: "test", revision: "v2" } }, "provider");
    expect(cacheKey(first.adapter, first.voice, "text")).not.toBe(cacheKey(second.adapter, second.voice, "text"));
  });
});
