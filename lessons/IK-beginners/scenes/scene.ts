import type { Bakers, Handle, PlainState, Schema } from "@tangible/core";
import type { SceneContext, SceneFrame, SceneModule } from "@tangible/player";
import { armControls, INK, LINK1, LINK2, MUTED, TIP, WORKSPACE } from "./controls.js";
import { drawAreaSurface, type SurfaceBox } from "./area-surface.js";
import { armLabels, type LabelFlags, type ScreenPose } from "./labels.js";
import {
  circlePath,
  circlePoint,
  directionOf,
  elbowBranch,
  forwardKinematics,
  inverseKinematics,
  MAX_LINK_CM,
  MAX_REACH_CM,
  MIN_LINK_CM,
  JOINT_LIMITS,
  limitedRadii,
  reachableRadii,
  unreachableSamples,
  TAU,
  wrapAngle,
  type ArmPose,
  type Point,
} from "./kinematics.js";

export const schema: Schema = {
  q1: {
    type: { kind: "scalar", range: [0, TAU] },
    default: 0.6,
    interpolate: "lerp",
    ownership: "script",
    label: "shoulder angle q1, in radians, measured from the x axis",
  },
  q2: {
    type: { kind: "scalar", range: [-Math.PI, Math.PI] },
    default: 0.9,
    interpolate: "lerp",
    ownership: "script",
    label: "elbow angle q2, in radians, measured from link 1",
  },
  l1: {
    type: { kind: "scalar", range: [MIN_LINK_CM, MAX_LINK_CM] },
    default: 9,
    interpolate: "lerp",
    ownership: "shared",
    label: "length of link 1, in centimetres",
  },
  l2: {
    type: { kind: "scalar", range: [MIN_LINK_CM, MAX_LINK_CM] },
    default: 7,
    interpolate: "lerp",
    ownership: "shared",
    label: "length of link 2, in centimetres",
  },
  "show.workspace": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "shade every position the tip can reach",
  },
  "label.motors": {
    type: { kind: "boolean" },
    default: true,
    interpolate: "snap",
    ownership: "script",
    label: "number the two motors on the drawing",
  },
  "label.angles": {
    type: { kind: "boolean" },
    default: true,
    interpolate: "snap",
    ownership: "script",
    label: "show the joint angle values on the drawing",
  },
  "label.links": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "show the link lengths on the drawing",
  },
  "label.dof": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "mark the arm's two degrees of freedom on the drawing",
  },
  "label.tip": {
    type: { kind: "boolean" },
    default: true,
    interpolate: "snap",
    ownership: "script",
    label: "name the end-effector and show its coordinates",
  },
  "show.unreachable": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "mark sample points the tip cannot reach",
  },
  "show.limits": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "apply joint limits, so the reachable space is no longer a ring",
  },
  "show.circle": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "draw the circle the end-effector is asked to trace",
  },
  "show.areaSurface": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "plot the reachable area against both link lengths",
  },
};

/**
 * Walk the end-effector once round the circle, solving the inverse problem at
 * each step, so the narration can play a real trajectory rather than a guess.
 */
export const bakers: Bakers = {
  circle: {
    reads: ["l1", "l2"],
    writes: ["q1", "q2"],
    run(input, { steps }) {
      const l1 = input.l1 as number;
      const l2 = input.l2 as number;
      return Array.from({ length: steps }, (_unused, index) => {
        const target = circlePoint(l1, l2, (index + 1) / steps);
        const solved = inverseKinematics(target, l1, l2, "up");
        return { q1: solved.q1, q2: solved.q2 };
      });
    },
  },
};

export const constants = { PI: Math.PI, HALF_PI: Math.PI / 2, QUARTER_PI: Math.PI / 4, TWO_PI: TAU };

/** Where the base sits on screen and how many pixels one centimetre occupies. */
export function armGeometry(ctx: SceneContext, compact = false) {
  const { width, height, canvasScale } = ctx.size();
  const [left, right] = compact ? [width * 0.02, width * 0.34] : [width * 0.04, width * 0.62];
  const [top, bottom] = [height * 0.16, height - 116];
  const radius = (Math.min(right - left, bottom - top) / 2) * 0.94;
  return {
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    pxPerCm: radius / MAX_REACH_CM,
    canvasScale,
    width,
    height,
  };
}

type Geometry = ReturnType<typeof armGeometry>;

/** Where the area surface sits when the narration asks for it. */
export function surfaceBox(ctx: SceneContext): SurfaceBox {
  const { width, height } = ctx.size();
  return { left: width * 0.34, right: width * 0.65, top: height * 0.26, bottom: height - 116 };
}

/** Centimetres to layout pixels, with the y axis pointing up. */
function toScreen(geometry: Geometry, point: Point): Point {
  return { x: geometry.cx + point.x * geometry.pxPerCm, y: geometry.cy - point.y * geometry.pxPerCm };
}

/** Layout pixels back to centimetres. */
function toWorld(geometry: Geometry, px: number, py: number): Point {
  return { x: (px - geometry.cx) / geometry.pxPerCm, y: (geometry.cy - py) / geometry.pxPerCm };
}

function poseOf(state: Readonly<PlainState>): ArmPose {
  return forwardKinematics(state.q1 as number, state.q2 as number, state.l1 as number, state.l2 as number);
}

export const scene: SceneModule = {
  schema,
  constants,
  designSize: { width: 1280, height: 720 },
  create(ctx) {
    const g = ctx.canvas.getContext("2d")!;
    const controls = armControls(ctx);

    return {
      render(state: Readonly<PlainState>, frame: SceneFrame) {
        const surfaceShown = state["show.areaSurface"] as boolean;
        const geometry = armGeometry(ctx, surfaceShown);
        const pose = poseOf(state);
        g.setTransform(geometry.canvasScale, 0, 0, geometry.canvasScale, 0, 0);
        g.clearRect(0, 0, geometry.width, geometry.height);
        g.lineCap = "round";
        g.lineJoin = "round";

        const flags: LabelFlags = {
          motors: state["label.motors"] as boolean,
          angles: state["label.angles"] as boolean,
          links: state["label.links"] as boolean,
          tip: state["label.tip"] as boolean,
          dof: state["label.dof"] as boolean,
        };
        if (state["show.workspace"]) {
          const [l1, l2] = [state.l1 as number, state.l2 as number];
          if (state["show.limits"]) drawLimitedReach(g, geometry, l1, l2);
          else drawWorkspace(g, geometry, l1, l2);
        }
        if (state["show.circle"]) drawCircle(g, geometry, state.l1 as number, state.l2 as number);
        if (state["show.unreachable"]) drawUnreachable(g, geometry, state.l1 as number, state.l2 as number);
        drawAxes(g, geometry);
        if (flags.tip) drawTipProjection(g, geometry, pose.tip);
        drawArm(g, geometry, state, pose, frame);
        if (flags.angles) drawAngles(g, geometry, state, pose);
        drawLabels(g, geometry, state, pose, flags);
        if (surfaceShown) {
          drawAreaSurface(g, surfaceBox(ctx), state.l1 as number, state.l2 as number, {
            ink: INK,
            muted: MUTED,
            allowed: WORKSPACE,
            ridge: LINK2,
            marker: TIP,
          });
        }
        controls.render(state, frame.activity);
      },
      handles: () => [tipHandle(ctx), elbowHandle(ctx)],
      dispose: () => controls.dispose(),
    };
  },
};

// Drawing ---------------------------------------------------------------

/** The annulus of every position the tip can reach with the current link lengths. */
function drawWorkspace(g: CanvasRenderingContext2D, geometry: Geometry, l1: number, l2: number) {
  const { inner, outer } = reachableRadii(l1, l2);
  const ring = new Path2D();
  ring.arc(geometry.cx, geometry.cy, outer * geometry.pxPerCm, 0, TAU);
  ring.arc(geometry.cx, geometry.cy, inner * geometry.pxPerCm, 0, TAU, true);
  g.fillStyle = "rgba(31, 111, 139, 0.12)";
  g.fill(ring);
  g.strokeStyle = "rgba(31, 111, 139, 0.55)";
  g.lineWidth = 1.5;
  g.setLineDash([5, 5]);
  g.stroke(ring);
  g.setLineDash([]);
  g.fillStyle = WORKSPACE;
  g.font = "600 13px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("reachable space", geometry.cx, geometry.cy - (outer * geometry.pxPerCm + 12));
}

/**
 * The reachable space once the joints are limited. It is no longer a ring, so
 * it is built from what the arm can actually do: for each shoulder angle the
 * tip sweeps an arc, and those arcs together are the region.
 */
function drawLimitedReach(g: CanvasRenderingContext2D, geometry: Geometry, l1: number, l2: number) {
  const [q1Min, q1Max] = JOINT_LIMITS.q1;
  const [q2Min, q2Max] = JOINT_LIMITS.q2;
  const steps = 160;
  g.save();
  g.strokeStyle = WORKSPACE;
  g.globalAlpha = 0.14;
  g.lineWidth = Math.max(3, (l2 * geometry.pxPerCm * 0.06));
  for (let i = 0; i <= steps; i += 1) {
    const q1 = q1Min + ((q1Max - q1Min) * i) / steps;
    const elbow = toScreen(geometry, { x: l1 * Math.cos(q1), y: l1 * Math.sin(q1) });
    g.beginPath();
    g.arc(elbow.x, elbow.y, l2 * geometry.pxPerCm, -(q1 + q2Max), -(q1 + q2Min));
    g.stroke();
  }
  g.restore();

  const { inner, outer } = limitedRadii(l1, l2);
  g.fillStyle = WORKSPACE;
  g.font = "600 13px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("reachable with joint limits", geometry.cx, geometry.cy - (outer * geometry.pxPerCm + 12));
  g.font = "11px system-ui, sans-serif";
  g.fillText(`no closer than ${inner.toFixed(1)} cm`, geometry.cx, geometry.cy + inner * geometry.pxPerCm * 0.5);
}

/** Crosses on points the tip cannot reach, both too far out and too far in. */
function drawUnreachable(g: CanvasRenderingContext2D, geometry: Geometry, l1: number, l2: number) {
  const points = unreachableSamples(l1, l2);
  g.strokeStyle = TIP;
  g.lineWidth = 2.5;
  g.lineCap = "round";
  for (const point of points) {
    const at = toScreen(geometry, point);
    const arm = 6;
    line(g, at.x - arm, at.y - arm, at.x + arm, at.y + arm);
    line(g, at.x - arm, at.y + arm, at.x + arm, at.y - arm);
  }
  const first = toScreen(geometry, points[0]!);
  g.fillStyle = TIP;
  g.font = "700 12px system-ui, sans-serif";
  g.textAlign = "left";
  g.fillText("no solution", first.x + 12, first.y - 8);
}

/** The circle the end-effector is asked to follow. */
function drawCircle(g: CanvasRenderingContext2D, geometry: Geometry, l1: number, l2: number) {
  const { centre, radius } = circlePath(l1, l2);
  const middle = toScreen(geometry, centre);
  g.strokeStyle = TIP;
  g.globalAlpha = 0.55;
  g.lineWidth = 2;
  g.setLineDash([6, 5]);
  g.beginPath();
  g.arc(middle.x, middle.y, radius * geometry.pxPerCm, 0, TAU);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
}

function drawAxes(g: CanvasRenderingContext2D, geometry: Geometry) {
  const span = MAX_REACH_CM * geometry.pxPerCm * 1.06;
  g.strokeStyle = "#c3cdd1";
  g.lineWidth = 1;
  line(g, geometry.cx - span, geometry.cy, geometry.cx + span, geometry.cy);
  line(g, geometry.cx, geometry.cy - span, geometry.cx, geometry.cy + span);

  g.fillStyle = MUTED;
  g.font = "11px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "top";
  for (let cm = -20; cm <= 20; cm += 5) {
    if (cm === 0) continue;
    const x = geometry.cx + cm * geometry.pxPerCm;
    line(g, x, geometry.cy - 4, x, geometry.cy + 4);
    g.fillText(String(cm), x, geometry.cy + 7);
  }
  g.textAlign = "left";
  g.fillText("x (cm)", geometry.cx + span - 42, geometry.cy + 7);
  g.textBaseline = "middle";
  g.fillText("y (cm)", geometry.cx + 8, geometry.cy - span + 10);
  g.textBaseline = "alphabetic";
}

/** Dashed guides that read the tip position off the two axes. */
function drawTipProjection(g: CanvasRenderingContext2D, geometry: Geometry, tip: Point) {
  const point = toScreen(geometry, tip);
  g.strokeStyle = "rgba(181, 50, 43, 0.45)";
  g.lineWidth = 1.5;
  g.setLineDash([4, 4]);
  line(g, point.x, point.y, point.x, geometry.cy);
  line(g, point.x, point.y, geometry.cx, point.y);
  g.setLineDash([]);
}

function drawArm(
  g: CanvasRenderingContext2D,
  geometry: Geometry,
  state: Readonly<PlainState>,
  pose: ArmPose,
  frame: SceneFrame,
) {
  const base = toScreen(geometry, pose.base);
  const elbow = toScreen(geometry, pose.elbow);
  const tip = toScreen(geometry, pose.tip);
  const link1Active = Boolean(frame.activity.q1 || frame.activity.l1);
  const link2Active = Boolean(frame.activity.q2 || frame.activity.l2);

  // Dashed continuation of link 1: the reference q2 is measured from.
  const reach = (state.l2 as number) * geometry.pxPerCm * 0.6;
  const q1 = state.q1 as number;
  g.strokeStyle = "#b9c4c8";
  g.lineWidth = 1.5;
  g.setLineDash([5, 4]);
  line(g, elbow.x, elbow.y, elbow.x + reach * Math.cos(q1), elbow.y - reach * Math.sin(q1));
  g.setLineDash([]);

  drawLink(g, base, elbow, LINK1, link1Active);
  drawLink(g, elbow, tip, LINK2, link2Active);

  const numbered = state["label.motors"] as boolean;
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  for (const [index, joint] of [base, elbow].entries()) {
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(joint.x, joint.y, numbered ? 10 : 7, 0, TAU);
    g.fill();
    g.stroke();
    if (!numbered) continue;
    // The motor number lives inside its own joint, where nothing can collide.
    g.fillStyle = INK;
    g.font = "700 12px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(index + 1), joint.x, joint.y);
    g.textBaseline = "alphabetic";
  }
  g.fillStyle = TIP;
  g.beginPath();
  g.arc(tip.x, tip.y, 8, 0, TAU);
  g.fill();
}

function drawLink(g: CanvasRenderingContext2D, from: Point, to: Point, color: string, active: boolean) {
  if (active) {
    g.strokeStyle = "rgba(181, 50, 43, 0.25)";
    g.lineWidth = 18;
    line(g, from.x, from.y, to.x, to.y);
  }
  g.strokeStyle = color;
  g.lineWidth = 9;
  line(g, from.x, from.y, to.x, to.y);
}

/** Arcs showing q1 at the base and q2 at the elbow. */
function drawAngles(g: CanvasRenderingContext2D, geometry: Geometry, state: Readonly<PlainState>, pose: ArmPose) {
  const q1 = state.q1 as number;
  const q2 = state.q2 as number;
  const base = toScreen(geometry, pose.base);
  const elbow = toScreen(geometry, pose.elbow);
  const baseRadius = Math.min(34, (state.l1 as number) * geometry.pxPerCm * 0.5);
  const elbowRadius = Math.min(30, (state.l2 as number) * geometry.pxPerCm * 0.5);

  drawArc(g, base, baseRadius, 0, q1, LINK1);
  drawArc(g, elbow, elbowRadius, q1, q1 + q2, LINK2);

}

/** A canvas arc drawn in world orientation, where positive angles turn counterclockwise. */
function drawArc(g: CanvasRenderingContext2D, centre: Point, radius: number, from: number, to: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(centre.x, centre.y, radius, -from, -to, to > from);
  g.stroke();
}

/** Draw whichever annotations the narration currently wants. */
function drawLabels(
  g: CanvasRenderingContext2D,
  geometry: Geometry,
  state: Readonly<PlainState>,
  pose: ArmPose,
  flags: LabelFlags,
) {
  const screen: ScreenPose = {
    base: toScreen(geometry, pose.base),
    elbow: toScreen(geometry, pose.elbow),
    tip: toScreen(geometry, pose.tip),
    baseArc: Math.min(34, (state.l1 as number) * geometry.pxPerCm * 0.5),
    elbowArc: Math.min(30, (state.l2 as number) * geometry.pxPerCm * 0.5),
  };
  const labels = armLabels(
    screen,
    { q1: state.q1 as number, q2: state.q2 as number },
    { l1: state.l1 as number, l2: state.l2 as number },
    pose.tip,
    flags,
    { ink: INK, muted: MUTED, link1: LINK1, link2: LINK2, tip: TIP },
  );
  g.textBaseline = "middle";
  for (const label of labels) {
    g.fillStyle = label.color;
    g.font = `${label.weight} ${label.size}px system-ui, sans-serif`;
    g.textAlign = label.align;
    g.fillText(label.text, label.x, label.y);
  }
  g.textBaseline = "alphabetic";
}

function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

// Dragging --------------------------------------------------------------

const GRAB_RADIUS = 20;

/** Dragging the elbow turns link 1, carrying link 2 with it. */
function elbowHandle(ctx: SceneContext): Handle {
  return {
    id: "elbow",
    params: ["q1"],
    hitTest: (px, py, state) => nearJoint(ctx, px, py, poseOf(state).elbow, state["show.areaSurface"] as boolean),
    onDrag(px, py, state) {
      const geometry = armGeometry(ctx, state["show.areaSurface"] as boolean);
      return { q1: wrapAngle(directionOf({ x: 0, y: 0 }, toWorld(geometry, px / geometry.canvasScale, py / geometry.canvasScale))) };
    },
  };
}

/**
 * Dragging the end-effector solves the inverse problem: both motors move so the
 * tip follows the pointer. The elbow keeps bending the way it already does, so
 * the arm does not snap to the other solution part-way through a drag.
 */
function tipHandle(ctx: SceneContext): Handle {
  return {
    id: "tip",
    params: ["q1", "q2"],
    hitTest: (px, py, state) => nearJoint(ctx, px, py, poseOf(state).tip, state["show.areaSurface"] as boolean),
    onDrag(px, py, state) {
      const geometry = armGeometry(ctx, state["show.areaSurface"] as boolean);
      const target = toWorld(geometry, px / geometry.canvasScale, py / geometry.canvasScale);
      const solved = inverseKinematics(target, state.l1 as number, state.l2 as number, elbowBranch(state.q2 as number));
      return { q1: solved.q1, q2: solved.q2 };
    },
  };
}

function nearJoint(ctx: SceneContext, px: number, py: number, joint: Point, compact: boolean): boolean {
  const geometry = armGeometry(ctx, compact);
  const target = toScreen(geometry, joint);
  return Math.hypot(px / geometry.canvasScale - target.x, py / geometry.canvasScale - target.y) <= GRAB_RADIUS;
}
