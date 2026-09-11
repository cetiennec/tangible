import { describe, expect, it } from "vitest";
import { buildIndex, evaluate } from "@tangible/core";
import { check, type SceneInfo } from "./check.js";
import { combineScenes } from "./scenes.js";
import { parseScript } from "./parse.js";
import { compile } from "./emit.js";

function module(defaultValue: number): SceneInfo {
  return {
    schema: {
      theta: { type: { kind: "scalar", range: [0, 100] }, default: defaultValue, ownership: "script", interpolate: "lerp" },
      "show.label": { type: { kind: "boolean" }, default: false, ownership: "script", interpolate: "snap" },
      camera: { type: { kind: "orbit" }, default: { target: [0, 0, 0], distance: 5, azimuth: 0, elevation: 0 }, ownership: "viewer", interpolate: "orbit" },
    },
    constants: { START: defaultValue + 1 },
    groups: { values: ["theta"] },
    presets: { close: { camera: { target: [0, 0, 0], distance: defaultValue + 2, azimuth: 0, elevation: 0 } } },
    bakers: { advance: { reads: ["theta"], writes: ["theta"], run: (state, { steps }) => Array.from({ length: steps }, (_, i) => ({ theta: Number(state.theta) + i + 1 })) } },
  };
}

const scenes = combineScenes({ circle: module(0), graph: module(10) }, "circle");
const options = { lessonId: "test", defaults: { anticipation: -0.2, ease: "linear", transition: 1 }, audioSrc: [], audioHash: "test" };

function build(script: string) {
  const parsed = parseScript(script);
  const timing = { charTimes: [...parsed.narration].map((_, i) => ({ start: i, end: i + 1 })), wordTimes: [], duration: parsed.narration.length };
  return compile(script, timing, scenes, options);
}

describe("multiple scene compilation", () => {
  it("keeps local parameters, constants, groups, cameras and baker state independent on revisits", () => {
    const script = `@cue(values = [START]) @show(label) @camera(close) Circle first.
@scene(graph) @cue(theta = START) @camera(close) Graph next.
@scene(circle) @bake(advance, steps: 1, over: 1s) Circle again.`;
    expect(check(parseScript(script), scenes)).toEqual([]);
    const result = build(script);
    const idx = buildIndex(result.tracks.tracks, scenes.schema);
    const final = evaluate(idx, result.tracks.duration);
    expect(final).toMatchObject({ scene: "circle", "circle.theta": 2, "graph.theta": 11, "circle.show.label": true, "graph.show.label": false });
    expect(final["circle.camera"]).toMatchObject({ distance: 2 });
    expect(final["graph.camera"]).toMatchObject({ distance: 12 });
    expect(build(script)).toEqual(result);
  });

  it("clamps anticipated cues at each scene entry and preserves source order on ties", () => {
    const result = build("Circle. @scene(graph) @cue(theta = 20) Graph. @scene(circle) @cue(theta = 3) Circle.");
    const switches = result.tracks.tracks.scene!;
    expect(result.tracks.tracks["graph.theta"]![0]!.t).toBe(switches[0]!.t);
    expect(result.tracks.tracks["circle.theta"]![0]!.t).toBe(switches[1]!.t);
    const idx = buildIndex(result.tracks.tracks, scenes.schema);
    expect(evaluate(idx, switches[0]!.t - 0.01).scene).toBe("circle");
    expect(evaluate(idx, switches[0]!.t)).toMatchObject({ scene: "graph", "graph.theta": 20 });
    expect(evaluate(idx, switches[1]!.t)).toMatchObject({ scene: "circle", "circle.theta": 3 });
  });

  it("keeps board, captions, pauses and chapters on the common timeline", () => {
    const result = build('@chapter(Circle) @board(note: "Keep this") Circle. @scene(graph) @chapter(Graph) Graph. @pause(prompt: "Try it.") @clear(board) Finish.');
    expect(result.tracks.chapters.map((chapter) => chapter.title)).toEqual(["Circle", "Graph"]);
    expect(result.tracks.pauses).toHaveLength(1);
    expect(result.tracks.tracks["board.note"]!.map((key) => key.v)).toEqual(["shown", "hidden"]);
    expect(result.vtt).toContain("Try it.");
    expect(result.vtt).not.toContain("@scene");
  });

  it("reports unknown scene and local parameter names at their source locations", () => {
    const errors = check(parseScript("@scene(missing) Missing.\n@scene(graph) @cue(other = 2) Graph."), scenes);
    expect(errors[0]).toMatchObject({ severity: "error", message: 'unknown scene "missing"', loc: { line: 1 } });
    expect(errors[1]).toMatchObject({ severity: "error", message: 'scene "graph": unknown parameter "other"', loc: { line: 2 } });
    expect(() => build("@scene(missing) Missing.")).toThrow('unknown scene "missing"');
  });

  it("keeps the outgoing scene visible at a pause immediately before a switch", () => {
    const result = build('@scene(graph) Explore. @pause(prompt: "Try it.") @scene(circle) Return.');
    const t = Math.round(result.tracks.pauses[0]!.t * 100) / 100;
    const index = buildIndex(result.tracks.tracks, scenes.schema);
    expect(evaluate(index, t).scene).toBe("graph");
    expect(evaluate(index, t + 0.02).scene).toBe("circle");
  });

  it("rejects ambiguous scene ids and missing initial scenes", () => {
    expect(() => combineScenes({ board: module(0) }, "board")).toThrow("reserved");
    expect(() => combineScenes({ "a.b": module(0) }, "a.b")).toThrow("invalid scene id");
    expect(() => combineScenes({ circle: module(0) }, "graph")).toThrow("unknown initial scene");
  });
});
