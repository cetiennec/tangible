// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PlainState } from "@tangible/core";
import type { SceneContext } from "@tangible/player";
import { armGeometry, scene, schema } from "./scene.js";
import { elbowBranch, forwardKinematics, JOINT_LIMITS } from "./kinematics.js";

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

  it("moves both motors so the end-effector follows the pointer", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const tip = instance.handles().find((handle) => handle.id === "tip")!;
    expect(tip.params).toEqual(["q1", "q2"]);

    const target = { x: 2, y: 11 };
    const at = screenOf(ctx, target);
    const { q1, q2 } = tip.onDrag(at.x, at.y, defaults) as { q1: number; q2: number };

    // The solved pose puts the tip exactly on the point that was dragged to.
    const moved = forwardKinematics(q1, q2, 9, 7);
    expect(moved.tip.x).toBeCloseTo(target.x, 9);
    expect(moved.tip.y).toBeCloseTo(target.y, 9);
    instance.dispose();
  });

  it("keeps the elbow bent the same way through a drag", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const tip = instance.handles().find((handle) => handle.id === "tip")!;

    // Default q2 is 0.9, which hangs the elbow below the line: elbow-down.
    const at = screenOf(ctx, { x: 8, y: -6 });
    const { q2 } = tip.onDrag(at.x, at.y, defaults) as { q2: number };
    expect(elbowBranch(q2)).toBe("down");

    // Starting from an elbow-up pose, the drag stays elbow-up.
    const up = { ...defaults, q2: -1.083 };
    const solved = tip.onDrag(at.x, at.y, up) as { q2: number };
    expect(elbowBranch(solved.q2)).toBe("up");
    instance.dispose();
  });

  it("pulls an out-of-reach target back to the arm's limit", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const tip = instance.handles().find((handle) => handle.id === "tip")!;

    const far = screenOf(ctx, { x: 60, y: 0 });
    const { q1, q2 } = tip.onDrag(far.x, far.y, defaults) as { q1: number; q2: number };
    const reach = Math.hypot(...Object.values(forwardKinematics(q1, q2, 9, 7).tip));
    expect(reach).toBeCloseTo(16, 9); // fully stretched: 9 + 7
    instance.dispose();
  });

  it("lets both handles swing freely while joint limits are not being shown", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const elbow = instance.handles().find((handle) => handle.id === "elbow")!;
    const tip = instance.handles().find((handle) => handle.id === "tip")!;

    // Straight down wraps to q1 = 3*PI/2, well outside JOINT_LIMITS.q1 = [0.25, 2.85].
    const down = screenOf(ctx, { x: 0, y: -9 });
    const { q1 } = elbow.onDrag(down.x, down.y, defaults) as { q1: number };
    expect(q1).toBeCloseTo((3 * Math.PI) / 2, 9);

    const behind = screenOf(ctx, { x: -8, y: 3 });
    const solved = tip.onDrag(behind.x, behind.y, defaults) as { q1: number; q2: number };
    const reached = forwardKinematics(solved.q1, solved.q2, 9, 7).tip;
    expect(reached.x).toBeCloseTo(-8, 9);
    expect(reached.y).toBeCloseTo(3, 9);
    instance.dispose();
  });

  it("stops each handle at its own joint stop once limits are shown", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const elbow = instance.handles().find((handle) => handle.id === "elbow")!;
    const tip = instance.handles().find((handle) => handle.id === "tip")!;
    const limited = { ...defaults, "show.limits": true };

    // Same drag as above, straight down: a real motor cannot follow it past
    // its own stop, regardless of what the other joint is doing. 3*PI/2 is
    // above JOINT_LIMITS.q1's upper bound, so it clamps to that upper bound.
    const down = screenOf(ctx, { x: 0, y: -9 });
    const { q1: elbowQ1 } = elbow.onDrag(down.x, down.y, limited) as { q1: number };
    expect(elbowQ1).toBeCloseTo(JOINT_LIMITS.q1[1], 9);

    const behind = screenOf(ctx, { x: -8, y: 3 });
    const { q1, q2 } = tip.onDrag(behind.x, behind.y, limited) as { q1: number; q2: number };
    expect(q1).toBeGreaterThanOrEqual(JOINT_LIMITS.q1[0]);
    expect(q1).toBeLessThanOrEqual(JOINT_LIMITS.q1[1]);
    expect(q2).toBeGreaterThanOrEqual(JOINT_LIMITS.q2[0]);
    expect(q2).toBeLessThanOrEqual(JOINT_LIMITS.q2[1]);
    // Clamped independently, so the tip no longer sits exactly on the pointer.
    const reached = forwardKinematics(q1, q2, 9, 7).tip;
    expect(Math.hypot(reached.x - -8, reached.y - 3)).toBeGreaterThan(0.01);
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
    expect(q1.getAttribute("aria-label")).toBe("Motor 1 angle q1 in radians");

    q1.value = "4.5";
    q1.dispatchEvent(new Event("input"));
    expect(ctx.write).toHaveBeenCalledWith("q1", 4.5);

    instance.dispose();
  });

  it("lets the slider reach the full range while limits are not shown", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    instance.render(defaults, { dt: 0, activity: {} });

    // 4.5 rad is outside JOINT_LIMITS.q1 = [0.25, 2.85] but inside [0, TAU).
    const q1 = ctx.overlay.querySelector<HTMLInputElement>('input[data-param="q1"]')!;
    q1.value = "4.5";
    q1.dispatchEvent(new Event("input"));
    expect(ctx.write).toHaveBeenCalledWith("q1", 4.5);
    instance.dispose();
  });

  it("stops the slider at the joint's own limit once limits are shown", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    // The stops only shade the track when this render has already happened;
    // onSlider reads the same state through the closure it captured.
    instance.render({ ...defaults, "show.limits": true }, { dt: 0, activity: {} });

    const q1 = ctx.overlay.querySelector<HTMLInputElement>('input[data-param="q1"]')!;
    q1.value = "4.5";
    q1.dispatchEvent(new Event("input"));
    expect(ctx.write).toHaveBeenCalledWith("q1", JOINT_LIMITS.q1[1]);

    const q2 = ctx.overlay.querySelector<HTMLInputElement>('input[data-param="q2"]')!;
    q2.value = String(-3);
    q2.dispatchEvent(new Event("input"));
    expect(ctx.write).toHaveBeenCalledWith("q2", JOINT_LIMITS.q2[0]);

    // Link length sliders have no limit entry and are never clamped.
    const l1 = ctx.overlay.querySelector<HTMLInputElement>('input[data-param="l1"]')!;
    l1.value = "3.5";
    l1.dispatchEvent(new Event("input"));
    expect(ctx.write).toHaveBeenCalledWith("l1", 3.5);
    instance.dispose();
  });

  it("flips to the other solution for the same end-effector point", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    instance.render(defaults, { dt: 0, activity: {} });

    const flip = ctx.overlay.querySelector<HTMLButtonElement>('button[data-action="flip-elbow"]')!;
    expect(flip.textContent).toBe("Flip to elbow-up");
    flip.click();

    const written = Object.fromEntries(
      (ctx.write as unknown as { mock: { calls: [string, number][] } }).mock.calls,
    );
    // The elbow swaps sides while the end-effector stays where it was.
    expect(elbowBranch(written.q2!)).toBe("up");
    const before = forwardKinematics(0.6, 0.9, 9, 7).tip;
    const after = forwardKinematics(written.q1!, written.q2!, 9, 7).tip;
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
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
