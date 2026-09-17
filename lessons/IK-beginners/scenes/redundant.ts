// A three-jointed arm reaching one fixed point. With three joints and only two
// coordinates to satisfy, the solutions form a continuous family rather than a
// short list: the arm can flex through all of them while the tip stays put.

import type { Point } from "./kinematics.js";

export const LINKS = { l1: 8, l2: 7, l3: 6 };
export const TARGET: Point = { x: 10, y: 8 };

export interface RedundantPose {
  joints: Point[];
  angles: number[];
}

/**
 * The span of first-joint angles from which the remaining two links can still
 * reach the target. Outside it the target is simply too far from the elbow.
 */
export function shoulderRange() {
  const reach = Math.hypot(TARGET.x, TARGET.y);
  const toTarget = Math.atan2(TARGET.y, TARGET.x);
  const far = LINKS.l2 + LINKS.l3;
  const cosine = (reach * reach + LINKS.l1 * LINKS.l1 - far * far) / (2 * LINKS.l1 * reach);
  // Stop just short of the fully stretched ends, where the arm locks straight.
  const half = Math.acos(Math.min(1, Math.max(-1, cosine))) * 0.94;
  return { from: toTarget - half, to: toTarget + half };
}

/** One member of the family, chosen by `spread` between 0 and 1. */
export function redundantPose(spread: number): RedundantPose {
  const { from, to } = shoulderRange();
  const q1 = from + spread * (to - from);
  const elbow = { x: LINKS.l1 * Math.cos(q1), y: LINKS.l1 * Math.sin(q1) };

  // The last two links form an ordinary two-link arm reaching from the elbow.
  const dx = TARGET.x - elbow.x;
  const dy = TARGET.y - elbow.y;
  const distance = Math.hypot(dx, dy);
  const cosine = Math.min(
    1,
    Math.max(-1, (distance * distance - LINKS.l2 * LINKS.l2 - LINKS.l3 * LINKS.l3) / (2 * LINKS.l2 * LINKS.l3)),
  );
  const sine = Math.sqrt(1 - cosine * cosine);
  const second = Math.atan2(dy, dx) - Math.atan2(LINKS.l3 * sine, LINKS.l2 + LINKS.l3 * cosine);
  const third = second + Math.atan2(sine, cosine);

  const wrist = { x: elbow.x + LINKS.l2 * Math.cos(second), y: elbow.y + LINKS.l2 * Math.sin(second) };
  const tip = { x: wrist.x + LINKS.l3 * Math.cos(third), y: wrist.y + LINKS.l3 * Math.sin(third) };
  return { joints: [{ x: 0, y: 0 }, elbow, wrist, tip], angles: [q1, second, third] };
}

// Scene ----------------------------------------------------------------

import type { PlainState, Schema } from "@tangible/core";
import type { SceneContext, SceneModule } from "@tangible/player";
import { INK, LINK1, LINK2, MUTED, TIP } from "./controls.js";
import { TAU } from "./kinematics.js";
import { orbitHandle } from "@tangible/ingredients";
import type { OrbitState } from "@tangible/core";
import { solveSpatial, TARGET as SPATIAL_TARGET } from "./spatial.js";
import { SpatialView } from "./spatial-view.js";

export const schema: Schema = {
  spread: {
    type: { kind: "scalar", range: [0, 1] },
    default: 0.5,
    interpolate: "lerp",
    ownership: "script",
    label: "which member of the family of solutions is shown",
  },
  camera: {
    type: { kind: "orbit" },
    default: { target: [...SPATIAL_TARGET], distance: 3.1, azimuth: 0.85, elevation: 0.42 },
    interpolate: "orbit",
    ownership: "viewer",
    label: "viewpoint on the arm in space",
  },
  "show.family": {
    type: { kind: "boolean" },
    default: true,
    interpolate: "snap",
    ownership: "script",
    label: "ghost several other solutions behind the active one",
  },
};

const GHOSTS = 7;

function plot(ctx: SceneContext) {
  const { width, height, canvasScale } = ctx.size();
  const [left, right] = [width * 0.02, width * 0.34];
  const [top, bottom] = [height * 0.2, height - 96];
  const span = LINKS.l1 + LINKS.l2 + LINKS.l3;
  return {
    cx: (left + right) / 2,
    cy: (top + bottom) * 0.62,
    k: (Math.min(right - left, bottom - top) / 2) * 0.92 / span,
    canvasScale,
    width,
    height,
  };
}

export const scene: SceneModule = {
  schema,
  designSize: { width: 1280, height: 720 },
  create(ctx: SceneContext) {
    const g = ctx.canvas.getContext("2d")!;
    const root = document.createElement("section");
    root.className = "red-scene";
    root.innerHTML = `
      <header>
        <p class="red-kicker">Spare joints</p>
        <h1>One point, endlessly many ways to reach it</h1>
      </header>
      <p class="red-caption red-caption-flat">3 joints, in a plane</p>
      <p class="red-caption red-caption-space">5 joints, in space</p>
      <div class="red-panel">
        <label class="red-label" for="red-spread">Flex the arm</label>
        <input id="red-spread" type="range" min="0" max="1" step="0.001"
          aria-label="Move through the family of solutions that all reach the same point">
        <p class="red-note">Both tips stay on their red point. Spare joints turn the solutions into a continuous family rather than a list, and the more spare joints, the wider that family. Drag the right-hand view to turn it.</p>
      </div>
    `;
    const style = document.createElement("style");
    style.textContent = STYLE;
    const player = ctx.overlay.parentElement!;
    player.classList.add("red-player");
    ctx.canvas.setAttribute("role", "img");
    ctx.canvas.setAttribute(
      "aria-label",
      "A robot arm with three joints reaching a fixed target. Faded copies show other arm shapes that reach the same target.",
    );
    ctx.overlay.append(style, root);
    const slider = root.querySelector("input")!;
    const spatial = new SpatialView(ctx.overlay, { bone: LINK1, joint: INK, target: TIP }, 4);
    const spatialBox = () => {
      const { width, height } = ctx.size();
      return { left: width * 0.36, top: height * 0.2, width: width * 0.32, height: height - height * 0.2 - 96 };
    };
    const onInput = () => ctx.write("spread", Number(slider.value));
    slider.addEventListener("input", onInput);

    const at = (view: ReturnType<typeof plot>, p: Point) => ({ x: view.cx + p.x * view.k, y: view.cy - p.y * view.k });

    function drawArm(view: ReturnType<typeof plot>, pose: RedundantPose, alpha: number, width: number) {
      const points = pose.joints.map((joint) => at(view, joint));
      g.globalAlpha = alpha;
      g.lineCap = "round";
      g.lineJoin = "round";
      for (let i = 0; i < points.length - 1; i += 1) {
        g.strokeStyle = [LINK1, LINK2, MUTED][i]!;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(points[i]!.x, points[i]!.y);
        g.lineTo(points[i + 1]!.x, points[i + 1]!.y);
        g.stroke();
      }
      if (alpha === 1) {
        g.fillStyle = "#ffffff";
        g.strokeStyle = INK;
        g.lineWidth = 2;
        for (const joint of points.slice(0, 3)) {
          g.beginPath();
          g.arc(joint.x, joint.y, 6, 0, TAU);
          g.fill();
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }

    return {
      render(state: Readonly<PlainState>) {
        const view = plot(ctx);
        g.setTransform(view.canvasScale, 0, 0, view.canvasScale, 0, 0);
        g.clearRect(0, 0, view.width, view.height);

        if (state["show.family"]) {
          for (let i = 0; i < GHOSTS; i += 1) drawArm(view, redundantPose(i / (GHOSTS - 1)), 0.17, 6);
        }
        drawArm(view, redundantPose(state.spread as number), 1, 9);

        const target = at(view, TARGET);
        g.fillStyle = TIP;
        g.beginPath();
        g.arc(target.x, target.y, 9, 0, TAU);
        g.fill();
        g.fillStyle = TIP;
        g.font = "700 13px system-ui, sans-serif";
        g.textAlign = "left";
        g.fillText("target", target.x + 15, target.y - 10);

        // Both arms are driven by the same number, so they step through their
        // families together.
        const spread = state.spread as number;
        spatial.place(spatialBox(), ctx.size());
        spatial.setPoses(
          solveSpatial(spread),
          state["show.family"] ? [0, 0.34, 0.67, 1].map((s) => solveSpatial(s)) : [],
        );
        const camera = state.camera as OrbitState;
        spatial.setCamera(camera.azimuth, camera.elevation, camera.distance, SPATIAL_TARGET);
        spatial.render();

        slider.value = String(state.spread as number);
      },
      handles: () => [
        orbitHandle({
          speed: 0.006,
          minElevation: -0.3,
          maxElevation: 1.3,
          zoomSpeed: 0.004,
          minDistance: 1.8,
          maxDistance: 5,
          // Dragging turns the spatial arm only; the flat one keeps its slider.
          hitTest(px, _py) {
            const box = spatialBox();
            const at = px / ctx.size().canvasScale;
            return at >= box.left && at <= box.left + box.width;
          },
        }),
      ],
      dispose() {
        spatial.dispose();
        slider.removeEventListener("input", onInput);
        root.remove();
        style.remove();
        player.classList.remove("red-player");
      },
    };
  },
};

const STYLE = `
.red-player { background: #f4f6f4; color: ${INK}; }
.red-scene { font-family: system-ui, sans-serif; }
.red-scene header { position: absolute; top: 5%; left: 4%; width: 56%; }
.red-kicker { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${MUTED}; }
.red-scene h1 { margin: 0; font-size: clamp(17px, 2.3vw, 27px); line-height: 1.15; font-weight: 600; }
.red-panel { position: absolute; right: 3%; top: 30%; width: 26%; pointer-events: auto; }
.red-label { display: block; font-size: 14px; font-weight: 600; }
.red-panel input { display: block; box-sizing: border-box; width: 100%; height: 44px; margin: 2px 0 8px; accent-color: ${LINK1}; cursor: pointer; }
.red-panel input:focus-visible { outline: 3px solid ${TIP}; outline-offset: 2px; }
.red-note { margin: 0; font-size: 12px; line-height: 1.45; color: ${MUTED}; }
.red-caption { position: absolute; bottom: 74px; margin: 0; text-align: center; font-size: 12px; font-weight: 700; letter-spacing: .04em; color: ${MUTED}; }
.red-caption-flat { left: 2%; width: 32%; }
.red-caption-space { left: 36%; width: 32%; }
.red-player .xv-board { top: 4%; right: 3%; width: 28%; height: 20%; padding: 0; font-size: 15px; }
.red-player .xv-captions { color: ${INK}; text-shadow: none; }
@media (max-height: 500px) and (orientation: landscape) {
  .red-scene h1 { font-size: 16px; }
  .red-panel { top: 26%; }
  .red-note { display: none; }
}
`;
