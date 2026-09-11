// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonTracks, PlainState } from "@tangible/core";
import { Player } from "./player.js";
import type { SceneContext, SceneFrame, SceneModule } from "./scene-host.js";

const tracks: LessonTracks = {
  version: 1, lessonId: "test", duration: 10, schemaHash: "", audio: { src: [], hash: "" },
  tracks: {
    scene: [{ t: 0, v: "circle" }, { t: 2, v: "graph" }, { t: 4, v: "circle" }],
    "circle.theta": [{ t: 0, v: 3 }],
    "graph.theta": [{ t: 2, v: 10 }, { t: 3, v: 20, ease: "linear" }],
    "board.note": [{ t: 0, v: "shown" }],
  },
  chapters: [], pauses: [], captions: { src: "" }, recorded: {},
  boardItems: { note: { kind: "text", source: "Same equation" } },
};

function scene(id: string) {
  const renders: { state: PlainState; frame: SceneFrame }[] = [];
  const contexts: SceneContext[] = [];
  const dispose = vi.fn();
  const module: SceneModule = {
    schema: { theta: { type: { kind: "scalar" }, default: 0, ownership: "viewer", interpolate: "lerp" } },
    create(ctx) {
      contexts.push(ctx);
      const control = document.createElement("button");
      control.textContent = id;
      ctx.overlay.append(control);
      const onClick = () => ctx.write("theta", 7);
      control.addEventListener("click", onClick);
      return {
        render: (state, frame) => renders.push({ state: { ...state }, frame }),
        handles: () => [{ id: "point", params: ["theta"], hitTest: (_x, _y, state) => typeof state.theta === "number", onDrag: () => ({ theta: 9 }) }],
        dispose() { dispose(); control.removeEventListener("click", onClick); control.remove(); },
      };
    },
  };
  return { module, renders, contexts, dispose };
}

const players: Player[] = [];
afterEach(() => { for (const player of players.splice(0)) player.dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); });

function setup(scaling = false) {
  const circle = scene("circle"), graph = scene("graph");
  if (scaling) circle.module.designSize = { width: 1280, height: 720 };
  const mount = document.createElement("div");
  document.body.append(mount);
  const player = new Player({ mount, scenes: { circle: circle.module, graph: graph.module }, initialScene: "circle", tracks });
  players.push(player);
  const seek = (t: number) => { player.clock.seek(t); player.driver.tick(); };
  return { player, circle, graph, mount, seek };
}

describe("multiple scene playback", () => {
  it("applies and removes scaling before creating each scene", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 2560, height: 1440 } as DOMRect);
    const { circle, graph, mount, seek } = setup(true);
    expect(circle.contexts[0]!.size()).toMatchObject({ width: 1280, height: 720, scale: 2 });
    seek(2.5);
    expect(graph.contexts[0]!.size()).toMatchObject({ width: 2560, height: 1440, scale: 1 });
    expect(mount.querySelector<HTMLElement>(".xv-player")!.style.zoom).toBe("1");
    seek(0);
    expect(circle.contexts[1]!.size()).toMatchObject({ width: 1280, height: 720, scale: 2 });
  });

  it("seeks directly into a scene with local state and activity, then recreates an earlier scene", () => {
    const { player, circle, graph, mount, seek } = setup();
    seek(2.5);
    expect(graph.renders.at(-1)!.state).toEqual({ theta: 15 });
    expect(graph.renders.at(-1)!.frame.activity.theta).toEqual({ source: "narration", strength: 1 });
    expect(circle.dispose).toHaveBeenCalledOnce();
    expect(mount.querySelectorAll("button")[0]!.textContent).toBe("graph");
    expect(player.store.plain["board.note"]).toBe("shown");
    const graphCanvas = graph.contexts[0]!.canvas;
    seek(0);
    expect(circle.contexts).toHaveLength(2);
    expect(graph.dispose).toHaveBeenCalledOnce();
    expect(circle.contexts[1]!.canvas).not.toBe(graphCanvas);
    expect(circle.renders.at(-1)!.state).toEqual({ theta: 3 });
    expect(mount.querySelectorAll(".xv-overlay button")).toHaveLength(1);
  });

  it("routes DOM controls, resets and drag handles only to their own scene", () => {
    const { player, circle, graph, mount, seek } = setup();
    seek(0);
    mount.querySelector<HTMLButtonElement>(".xv-overlay button")!.click();
    player.driver.tick();
    expect(player.store.plain["circle.theta"]).toBe(7);
    expect(player.store.plain["graph.theta"]).toBe(0);
    circle.contexts[0]!.reset("theta");
    player.driver.tick();
    expect(player.store.plain["circle.theta"]).toBe(3);
    const handle = player.host.handles()[0]!;
    expect(handle.params).toEqual(["circle.theta"]);
    expect(handle.hitTest(0, 0, player.displayStore.plain)).toBe(true);
    expect(handle.onDrag(0, 0, player.displayStore.plain)).toEqual({ "circle.theta": 9 });
    seek(2.5);
    graph.contexts[0]!.write("theta", 5);
    player.driver.tick();
    expect(player.store.plain["graph.theta"]).toBe(5);
    expect(player.store.plain["circle.theta"]).toBe(3);
  });

  it("cancels an active drag and viewer overrides when normal playback crosses a scene boundary", () => {
    const { player, circle, seek } = setup();
    seek(1.99);
    const pause = vi.spyOn(player.clock, "pause");
    const canvas = circle.contexts[0]!.canvas;
    canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: 10, clientY: 10 }));
    expect(player.store.meta.get("circle.theta")!.dragging).toBe(true);
    player.audio.currentTime = 2.01;
    player.driver.tick();
    expect(player.store.meta.get("circle.theta")).toMatchObject({ dragging: false, modified: false, touchedEver: false });
    canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: 20 }));
    expect(player.store.meta.get("circle.theta")!.modified).toBe(false);
    expect(pause).not.toHaveBeenCalled();
    seek(4.1);
    expect(circle.renders.at(-1)!.state.theta).toBe(3);
  });

  it("clears a drag even for a small seek inside the same scene", () => {
    const { player, circle, seek } = setup();
    seek(0);
    circle.contexts[0]!.canvas.dispatchEvent(new MouseEvent("pointerdown"));
    seek(0.1);
    expect(player.store.meta.get("circle.theta")!.dragging).toBe(false);
    expect(player.store.plain["circle.theta"]).toBe(3);
    expect(circle.contexts).toHaveLength(1);
  });
});
