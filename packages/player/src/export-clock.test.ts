// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { AudioClock } from "./clock.js";
import { ExportMedia, exportControls } from "./export-clock.js";
import { PauseGate } from "./pause-gate.js";

describe("ExportMedia", () => {
  it("stops at a checkpoint like real playback, and Continue resumes it", async () => {
    const media = new ExportMedia(20);
    const clock = new AudioClock(media);
    const gate = new PauseGate(clock, [{ t: 5, id: "p0", prompt: "Try it." }]);
    const controls = exportControls(media, () => gate.update(clock.t), () => undefined);

    for (let t = 4.9; t < 5.1; t += 1 / 30) await controls.step(t);
    expect(controls.state()).toMatchObject({ t: 5, paused: true });
    expect(gate.activePrompt).toBe("Try it.");

    // Held frames do not move time while the checkpoint holds.
    expect((await controls.step(5.5)).t).toBe(5);

    controls.resume();
    expect(gate.activePrompt).toBeNull();
    expect((await controls.step(5.2)).t).toBeCloseTo(5.2);
  });

  it("never runs past the end of the lesson", async () => {
    const media = new ExportMedia(3);
    const controls = exportControls(media, () => undefined, () => "main");
    expect(await controls.step(4)).toEqual({ t: 3, paused: false, scene: "main" });
  });
});
