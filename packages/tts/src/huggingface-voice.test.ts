import { describe, expect, it } from "vitest";
import { countPops, HuggingFaceVoiceAdapter } from "./huggingface-voice.js";

describe("HuggingFaceVoiceAdapter", () => {
  it("invalidates cache identity on synthesis changes but not credential rotation", () => {
    const options = { endpointUrl: "https://voice.example", speaker: "test", seed: 42, revision: "weights-v1", token: "token-a" };
    const original = new HuggingFaceVoiceAdapter(options).modelId;
    for (const change of [
      { endpointUrl: "https://other.example" }, { speaker: "other" },
      { seed: 43 }, { revision: "weights-v2" },
    ]) {
      expect(new HuggingFaceVoiceAdapter({ ...options, ...change }).modelId).not.toBe(original);
    }
    expect(new HuggingFaceVoiceAdapter({ ...options, token: "token-b" }).modelId).toBe(original);
    expect(new HuggingFaceVoiceAdapter({ ...options, endpointUrl: "https://voice.example/" }).modelId).toBe(original);
    expect(original).not.toContain(options.token);
    expect(original).not.toContain(options.endpointUrl);
  });

  it("generates each answer beat and joins PCM WAV audio with exact start times, pausing after a full stop", async () => {
    const requests: { url: string; authorization: string; scaleUpTimeout: string; body?: Record<string, unknown> }[] = [];
    const statuses: string[] = [];
    const clips = [pcmWav(0.25), pcmWav(0.5)];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init!.headers);
      requests.push({
        url: String(input),
        authorization: headers.get("authorization") ?? "",
        scaleUpTimeout: headers.get("x-scale-up-timeout") ?? "",
        body: init!.body ? JSON.parse(String(init!.body)) : undefined,
      });
      if (String(input).endsWith("/health")) return { ok: true, status: 200, text: async () => "" } as Response;
      const clip = clips[requests.length - 2]!;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => clip.slice().buffer as ArrayBuffer,
        text: async () => "",
      } as Response;
    };
    const adapter = new HuggingFaceVoiceAdapter({
      endpointUrl: "https://voice.example/",
      token: "secret",
      revision: "weights-v2",
      onStatus: (message) => statuses.push(message),
      fetchImpl,
    });

    const result = await adapter.synthesizeSegments!({
      segments: ["First.", "Second."],
      voice: "david_v1",
    });

    expect(result.segmentStarts).toEqual([0, 0.65]);
    expect(result.duration).toBe(1.15);
    expect(result.format).toBe("wav");
    expect(new DataView(result.audio.buffer).getUint32(40, true)).toBe(18_400);
    expect(result.audio.subarray(44 + 4_000, 44 + 10_400).every((byte) => byte === 0)).toBe(true);
    expect(requests.map((request) => request.url)).toEqual([
      "https://voice.example/health",
      "https://voice.example/generate",
      "https://voice.example/generate",
    ]);
    expect(requests.every((request) => request.authorization === "Bearer secret")).toBe(true);
    expect(requests.every((request) => request.scaleUpTimeout === "600")).toBe(true);
    expect(requests[1]!.body).toMatchObject({ text: "First.", language: "English", speaker: "david_v1", seed: 20260717 });
    expect(requests[2]!.body!.seed).toBe(20260718);
    expect(requests[1]!.body).toMatchObject({ temperature: 0.9, top_p: 0.95 });
    expect(requests[1]!.body).not.toHaveProperty("revision");
    expect(statuses).toEqual([
      "Tangible is waiting for the Hugging Face voice endpoint; a cold start can take several minutes.",
      "The Hugging Face voice endpoint is ready.",
      "Tangible is generating narration segment 1 of 2.",
      "Tangible is generating narration segment 2 of 2.",
    ]);
  });

  it("pauses longer after a question than a full stop, and not at all after a comma", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).endsWith("/health")) return { ok: true, status: 200, text: async () => "" } as Response;
      return { ok: true, status: 200, arrayBuffer: async () => pcmWav(1).buffer as ArrayBuffer, text: async () => "" } as Response;
    };
    const adapter = new HuggingFaceVoiceAdapter({ endpointUrl: "https://voice.example", token: "secret", fetchImpl });

    const result = await adapter.synthesizeSegments!({
      segments: ["First,", "is it?", "\u201cQuoted.\u201d", "Last"],
      voice: "david_v1",
    });

    expect(result.segmentStarts).toEqual([0, 1, 2.5, 3.9]);
    expect(result.duration).toBe(4.9);
  });
});

describe("countPops", () => {
  it("finds no pop in smooth speech-like audio", () => {
    expect(countPops(parsed(speechWav({})))).toBe(0);
  });

  it("counts a crackle of abrupt jumps as one pop", () => {
    expect(countPops(parsed(speechWav({ pops: 1 })))).toBe(1);
    expect(countPops(parsed(speechWav({ pops: 3 })))).toBe(3);
  });

  it("does not mistake an isolated sharp jump, like a consonant, for a pop", () => {
    expect(countPops(parsed(speechWav({ pops: 1, popLength: 2 })))).toBe(0);
  });
});

describe("HuggingFaceVoiceAdapter pop check", () => {
  function adapterAnswering(takes: Uint8Array[]) {
    const seeds: number[] = [];
    const statuses: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/health")) return { ok: true, status: 200, text: async () => "" } as Response;
      seeds.push(JSON.parse(String(init!.body)).seed);
      const take = takes[seeds.length - 1]!;
      return { ok: true, status: 200, arrayBuffer: async () => take.slice().buffer as ArrayBuffer, text: async () => "" } as Response;
    };
    const adapter = new HuggingFaceVoiceAdapter({ endpointUrl: "https://voice.example", token: "secret", seed: 1000, fetchImpl, onStatus: (m) => statuses.push(m) });
    return { adapter, seeds, statuses };
  }

  it("asks again with another seed when a clip pops, and keeps the clean take", async () => {
    const clean = speechWav({ amplitude: 0.2 });
    const { adapter, seeds, statuses } = adapterAnswering([speechWav({ pops: 1 }), clean]);
    const result = await adapter.synthesizeSegments!({ segments: ["One sentence."], voice: "v" });
    expect(seeds).toEqual([1000, 1000 + 100_003]);
    expect(statuses).toContain("Tangible is regenerating narration segment 1, which had a pop.");
    expect(result.audio.slice(44)).toEqual(clean.slice(44));
  });

  it("gives up after three takes and keeps the one with the fewest pops", async () => {
    const fewest = speechWav({ pops: 1, amplitude: 0.2 });
    const { adapter, seeds } = adapterAnswering([speechWav({ pops: 2 }), fewest, speechWav({ pops: 3 })]);
    const result = await adapter.synthesizeSegments!({ segments: ["One sentence."], voice: "v" });
    expect(seeds).toHaveLength(3);
    expect(result.audio.slice(44)).toEqual(fewest.slice(44));
  });
});

/** One second of a 200 Hz tone at 24 kHz, with optional crackles: alternating near-full-scale samples. */
function speechWav({ pops = 0, popLength = 12, amplitude = 0.3 }: { pops?: number; popLength?: number; amplitude?: number }): Uint8Array {
  const rate = 24000;
  const samples = new Int16Array(rate);
  for (let i = 0; i < rate; i++) samples[i] = Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * 200 * i) / rate));
  for (let p = 0; p < pops; p++) {
    const at = Math.round(((p + 1) / (pops + 1)) * rate);
    for (let k = 0; k < popLength; k++) samples[at + k] = k % 2 ? -29000 : 29000;
  }
  const audio = new Uint8Array(44 + samples.byteLength);
  const view = new DataView(audio.buffer);
  writeAscii(audio, 0, "RIFF");
  view.setUint32(4, audio.length - 8, true);
  writeAscii(audio, 8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(audio, 36, "data");
  view.setUint32(40, samples.byteLength, true);
  audio.set(new Uint8Array(samples.buffer), 44);
  return audio;
}

/** The fields countPops reads, from a WAV built by speechWav. */
function parsed(wav: Uint8Array) {
  return { data: wav.subarray(44), channels: 1, sampleRate: 24000 };
}

function pcmWav(duration: number): Uint8Array {
  const rate = 8000;
  const dataLength = Math.round(duration * rate) * 2;
  const audio = new Uint8Array(44 + dataLength);
  const view = new DataView(audio.buffer);
  writeAscii(audio, 0, "RIFF");
  view.setUint32(4, audio.length - 8, true);
  writeAscii(audio, 8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(audio, 36, "data");
  view.setUint32(40, dataLength, true);
  return audio;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
}
