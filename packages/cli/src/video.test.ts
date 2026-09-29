import { describe, expect, it } from "vitest";
import { soundtrackFilter, soundtrackPlan } from "./video.js";

describe("soundtrackPlan", () => {
  it("cuts the narration at each held checkpoint and fills the hold with silence", () => {
    expect(soundtrackPlan(0, 60, [{ at: 20, seconds: 3 }, { at: 45, seconds: 3 }])).toEqual([
      { start: 0, end: 20 },
      { silence: 3 },
      { start: 20, end: 45 },
      { silence: 3 },
      { start: 45, end: 60 },
    ]);
  });

  it("keeps the soundtrack exactly as long as the video", () => {
    const holds = [{ at: 12.5, seconds: 2 }, { at: 31, seconds: 2 }];
    const plan = soundtrackPlan(10, 40, holds);
    const length = plan.reduce((sum, piece) => sum + ("silence" in piece ? piece.silence : piece.end - piece.start), 0);
    expect(length).toBeCloseTo(40 - 10 + 4);
  });

  it("starts with silence when the export begins on a held checkpoint", () => {
    expect(soundtrackPlan(5, 8, [{ at: 5, seconds: 1 }])).toEqual([{ silence: 1 }, { start: 5, end: 8 }]);
  });
});

describe("soundtrackFilter", () => {
  it("trims the lesson audio, adds silence, and joins the pieces in order", () => {
    expect(soundtrackFilter([{ start: 0, end: 2 }, { silence: 1.5 }])).toBe(
      "[1:a]atrim=start=0.000:end=2.000,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=mono[p0];"
        + "anullsrc=r=48000:cl=mono,atrim=duration=1.500[p1];[p0][p1]concat=n=2:v=0:a=1[a]",
    );
  });
});
