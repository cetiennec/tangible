// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { SceneContext } from "@tangible/player";
import { circleGeometry, pointOnCircle, scene } from "./scene.js";
import { graphGeometry, scene as cosine } from "./cosine.js";

function context(): SceneContext {
  const player = document.createElement("div");
  const overlay = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 450;
  player.append(canvas, overlay);
  const drawing = new Proxy({}, { get: () => vi.fn(), set: () => true }) as CanvasRenderingContext2D;
  canvas.getContext = vi.fn(() => drawing) as unknown as HTMLCanvasElement["getContext"];
  return { canvas, overlay, viewport: () => ({ width: 800, height: 450 }), size: () => ({ width: 800, height: 450, scale: 1, canvasScale: 1 }), write: vi.fn(), reset: vi.fn(), pause: vi.fn() };
}

describe("circle and cosine representations", () => {
  it("agrees on cosine at the cardinal angles", () => {
    const box = graphGeometry(context());
    for (const [theta, expected] of [[0, 1], [Math.PI / 2, 0], [Math.PI, -1], [Math.PI * 2, 1]]) {
      expect(pointOnCircle(theta!).x).toBeCloseTo(expected!, 12);
      expect((box.cy - box.y(theta!)) / box.amplitude).toBeCloseTo(expected!, 12);
    }
    expect(pointOnCircle(Math.PI / 2).y).toBeCloseTo(1, 12);
  });

  it("maps a circle drag to a counterclockwise angle", () => {
    const ctx = context(), instance = scene.create(ctx);
    const { cx, cy, radius } = circleGeometry(ctx);
    const handle = instance.handles()[0]!;
    expect(handle.hitTest(cx + radius, cy, { theta: 0 })).toBe(true);
    expect(handle.hitTest(cx, cy, { theta: 0 })).toBe(false);
    expect(handle.onDrag(cx, cy - radius, {}).theta).toBeCloseTo(Math.PI / 2, 12);
    expect(handle.onDrag(cx, cy + radius, {}).theta).toBeCloseTo(3 * Math.PI / 2, 12);
    instance.dispose();
  });

  it("maps and bounds graph dragging by the horizontal coordinate", () => {
    const ctx = context(), instance = cosine.create(ctx);
    const box = graphGeometry(ctx), handle = instance.handles()[0]!;
    expect(handle.onDrag(box.x(Math.PI), 0, {}).theta).toBeCloseTo(Math.PI, 12);
    expect(handle.onDrag(box.left - 100, 0, {}).theta).toBe(0);
    expect(handle.onDrag(box.right + 100, 0, {}).theta).toBe(Math.PI * 2);
    instance.dispose();
  });

  it.each([scene, cosine])("renders and provides a keyboard-accessible angle control with cleanup", (module) => {
    const ctx = context(), instance = module.create(ctx);
    const state = Object.fromEntries(Object.entries(module.schema).map(([key, spec]) => [key, spec.default]));
    instance.render({ ...state, theta: Math.PI }, { dt: 0, activity: {} });
    expect(ctx.overlay.querySelector("output")!.textContent).toContain("-1.00");
    const slider = ctx.overlay.querySelector("input")!;
    expect(slider.getAttribute("aria-label")).toBe("Angle theta");
    slider.value = "1"; slider.dispatchEvent(new Event("input"));
    expect(ctx.write).toHaveBeenCalledWith("theta", 1);
    instance.dispose();
    expect(ctx.overlay.children).toHaveLength(0);
    expect(ctx.overlay.parentElement!.classList.contains("trig-player")).toBe(false);
  });
});
