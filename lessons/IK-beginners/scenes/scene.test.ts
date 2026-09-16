// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PlainState } from "@tangible/core";
import type { SceneContext } from "@tangible/player";
import { armGeometry, scene, schema } from "./scene.js";
import { forwardKinematics } from "./kinematics.js";

function context(): SceneContext {
  const player = document.createElement("div");
  const overlay = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  player.append(canvas, overlay);
  const drawing = new Proxy({}, { get: () => vi.fn(), set: () => true }) as CanvasRenderingContext2D;
  canvas.getContext = vi.fn(() => drawing) as unknown as HTMLCanvasElement["getContext"];
  return {
    canvas,
    overlay,
    viewport: () => ({ width: 1280, height: 720 }),
    size: () => ({ width: 1280, height: 720, scale: 1, canvasScale: 1 }),
    write: vi.fn(),
    reset: vi.fn(),
    pause: vi.fn(),
  };
}

const defaults = Object.fromEntries(Object.entries(schema).map(([key, spec]) => [key, spec.default])) as PlainState;

/** Layout pixels for a point given in centimetres. */
function screenOf(ctx: SceneContext, point: { x: number; y: number }) {
  const { cx, cy, pxPerCm } = armGeometry(ctx);
  return { x: cx + point.x * pxPerCm, y: cy - point.y * pxPerCm };
}

beforeAll(() => {
  // jsdom has no Path2D, and the workspace annulus is drawn with one.
  (globalThis as Record<string, unknown>).Path2D = class {
    arc() {}
  };
});

describe("dragging the arm", () => {
  it("turns link 1 when the elbow is dragged, without touching q2", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const elbow = instance.handles().find((handle) => handle.id === "elbow")!;
    const pose = forwardKinematics(0.6, 0.9, 9, 7);

    expect(elbow.hitTest(screenOf(ctx, pose.elbow).x, screenOf(ctx, pose.elbow).y, defaults)).toBe(true);
    expect(elbow.hitTest(screenOf(ctx, { x: 0, y: 0 }).x, screenOf(ctx, { x: 0, y: 0 }).y, defaults)).toBe(false);

    const straightUp = screenOf(ctx, { x: 0, y: 9 });
    expect(elbow.onDrag(straightUp.x, straightUp.y, defaults)).toEqual({ q1: expect.closeTo(Math.PI / 2, 12) });
    expect(elbow.params).toEqual(["q1"]);
    instance.dispose();
  });

  it("turns link 2 about the elbow when the tip is dragged", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const tip = instance.handles().find((handle) => handle.id === "tip")!;
    const pose = forwardKinematics(0.6, 0.9, 9, 7);
    const at = screenOf(ctx, pose.tip);

    expect(tip.hitTest(at.x, at.y, defaults)).toBe(true);

    // Point link 2 straight along the x axis: q2 then cancels q1 exactly.
    const along = screenOf(ctx, { x: pose.elbow.x + 5, y: pose.elbow.y });
    expect(tip.onDrag(along.x, along.y, defaults).q2).toBeCloseTo(2 * Math.PI - 0.6, 12);
    expect(tip.params).toEqual(["q2"]);
    instance.dispose();
  });

  it("agrees with the kinematics after a drag is written back", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const tip = instance.handles().find((handle) => handle.id === "tip")!;
    const target = { x: 2, y: 11 };
    const at = screenOf(ctx, target);
    const { q2 } = tip.onDrag(at.x, at.y, defaults) as { q2: number };

    // The tip lands on the ray from the elbow through the pointer.
    const moved = forwardKinematics(0.6, q2, 9, 7);
    const elbow = forwardKinematics(0.6, 0.9, 9, 7).elbow;
    const toPointer = Math.atan2(target.y - elbow.y, target.x - elbow.x);
    const toTip = Math.atan2(moved.tip.y - elbow.y, moved.tip.x - elbow.x);
    expect(toTip).toBeCloseTo(toPointer, 12);
    instance.dispose();
  });
});

describe("the control panel", () => {
  it("shows the current state and writes learner changes", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    instance.render({ ...defaults, q1: 1.25, l2: 11.5 }, { dt: 0, activity: {} });

    const q1 = ctx.overlay.querySelector<HTMLInputElement>('input[data-param="q1"]')!;
    expect(q1.value).toBe("1.25");
    expect(ctx.overlay.querySelector('[data-value="q1"]')!.textContent).toBe("1.25 rad");
    expect(ctx.overlay.querySelector('[data-value="l2"]')!.textContent).toBe("11.5 cm");
    expect(q1.getAttribute("aria-label")).toBe("Shoulder angle q1 in radians");

    q1.value = "4.5";
    q1.dispatchEvent(new Event("input"));
    expect(ctx.write).toHaveBeenCalledWith("q1", 4.5);

    instance.dispose();
  });

  it("reports the reachable area in both units", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    instance.render({ ...defaults, l1: 10, l2: 10 }, { dt: 0, activity: {} });

    // Equal links of 10 cm give a full disc of radius 20 cm: 400 pi square centimetres.
    expect(ctx.overlay.querySelector('[data-value="area"]')!.textContent).toBe("1257 cm\u00b2 \u00b7 0.1257 m\u00b2");

    // The most lopsided pair the sliders allow sweeps far less, despite reaching further.
    instance.render({ ...defaults, l1: 3, l2: 12 }, { dt: 0, activity: {} });
    expect(ctx.overlay.querySelector('[data-value="area"]')!.textContent).toBe("452 cm\u00b2 \u00b7 0.0452 m\u00b2");
    instance.dispose();
  });

  it("slides both plot markers along the constant line", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const marker = (param: string) => ctx.overlay.querySelector(`[data-dot="${param}"]`)!;

    instance.render({ ...defaults, l1: 12, l2: 3 }, { dt: 0, activity: {} });
    // The longest link sits at 1 on the horizontal axis, the shortest at a quarter.
    expect(Number(marker("l1").getAttribute("cx"))).toBeCloseTo(290, 6);
    expect(Number(marker("l2").getAttribute("cx"))).toBeCloseTo(99.5, 6);

    // Both markers stay on the same height, because the ratio never changes.
    const level = marker("l1").getAttribute("cy");
    instance.render({ ...defaults, l1: 5, l2: 11 }, { dt: 0, activity: {} });
    expect(marker("l1").getAttribute("cy")).toBe(level);
    expect(marker("l2").getAttribute("cy")).toBe(level);
    expect(Number(marker("l1").getAttribute("cx"))).toBeLessThan(Number(marker("l2").getAttribute("cx")));
    instance.dispose();
  });

  it("turns the reachable space on and off with the button", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const button = ctx.overlay.querySelector<HTMLButtonElement>('button[data-param="show.workspace"]')!;

    instance.render(defaults, { dt: 0, activity: {} });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.textContent).toBe("Show reachable space");
    button.click();
    expect(ctx.write).toHaveBeenCalledWith("show.workspace", true);

    instance.render({ ...defaults, "show.workspace": true }, { dt: 0, activity: {} });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toBe("Hide reachable space");
    button.click();
    expect(ctx.write).toHaveBeenLastCalledWith("show.workspace", false);
    instance.dispose();
  });

  it("marks the row of a parameter the narration is moving", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    instance.render(defaults, { dt: 0, activity: { q2: { source: "narration", strength: 1 } } });

    expect(ctx.overlay.querySelector('[data-row="q2"]')!.classList.contains("ik-active")).toBe(true);
    expect(ctx.overlay.querySelector('[data-row="q1"]')!.classList.contains("ik-active")).toBe(false);
    instance.dispose();
  });

  it("renders the reachable space and cleans up after itself", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    instance.render({ ...defaults, "show.workspace": true }, { dt: 0, activity: {} });

    instance.dispose();
    expect(ctx.overlay.children).toHaveLength(0);
    expect(ctx.canvas.parentElement!.classList.contains("ik-player")).toBe(false);
  });
});
