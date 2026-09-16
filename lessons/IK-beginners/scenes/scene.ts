import type { Handle, PlainState, Schema } from "@tangible/core";
import type { SceneContext, SceneFrame, SceneModule } from "@tangible/player";
import { armControls, INK, LINK1, LINK2, MUTED, TIP, WORKSPACE } from "./controls.js";
import {
  directionOf,
  forwardKinematics,
  MAX_LINK_CM,
  MAX_REACH_CM,
  MIN_LINK_CM,
  reachableRadii,
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
    type: { kind: "scalar", range: [0, TAU] },
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
};

export const constants = { PI: Math.PI, HALF_PI: Math.PI / 2, QUARTER_PI: Math.PI / 4, TWO_PI: TAU };

/** Where the base sits on screen and how many pixels one centimetre occupies. */
export function armGeometry(ctx: SceneContext) {
  const { width, height, canvasScale } = ctx.size();
  const [left, right] = [width * 0.04, width * 0.62];
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
        const geometry = armGeometry(ctx);
        const pose = poseOf(state);
        g.setTransform(geometry.canvasScale, 0, 0, geometry.canvasScale, 0, 0);
        g.clearRect(0, 0, geometry.width, geometry.height);
        g.lineCap = "round";
        g.lineJoin = "round";

        if (state["show.workspace"]) drawWorkspace(g, geometry, state.l1 as number, state.l2 as number);
        drawAxes(g, geometry);
        drawTipProjection(g, geometry, pose.tip);
        drawArm(g, geometry, state, pose, frame);
        drawAngles(g, geometry, state, pose);
        drawTipReadout(g, geometry, pose.tip);
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

  g.fillStyle = "#ffffff";
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  for (const joint of [base, elbow]) {
    g.beginPath();
    g.arc(joint.x, joint.y, 7, 0, TAU);
    g.fill();
    g.stroke();
  }
  g.fillStyle = TIP;
  g.beginPath();
  g.arc(tip.x, tip.y, 8, 0, TAU);
  g.fill();

  g.font = "600 13px system-ui, sans-serif";
  g.textAlign = "center";
  labelAt(g, LINK1, `L₁ = ${(state.l1 as number).toFixed(1)}`, midpoint(base, elbow), 16);
  labelAt(g, LINK2, `L₂ = ${(state.l2 as number).toFixed(1)}`, midpoint(elbow, tip), -12);
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

  g.font = "600 14px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const q1Label = { x: base.x + (baseRadius + 15) * Math.cos(q1 / 2), y: base.y - (baseRadius + 15) * Math.sin(q1 / 2) };
  const q2Label = {
    x: elbow.x + (elbowRadius + 15) * Math.cos(q1 + q2 / 2),
    y: elbow.y - (elbowRadius + 15) * Math.sin(q1 + q2 / 2),
  };
  g.fillStyle = LINK1;
  g.fillText(`q₁ = ${q1.toFixed(2)}`, q1Label.x, q1Label.y);
  g.fillStyle = LINK2;
  g.fillText(`q₂ = ${q2.toFixed(2)}`, q2Label.x, q2Label.y);
  g.textBaseline = "alphabetic";
}

/** A canvas arc drawn in world orientation, where positive angles turn counterclockwise. */
function drawArc(g: CanvasRenderingContext2D, centre: Point, radius: number, from: number, to: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(centre.x, centre.y, radius, -from, -to, to > from);
  g.stroke();
}

function drawTipReadout(g: CanvasRenderingContext2D, geometry: Geometry, tip: Point) {
  const point = toScreen(geometry, tip);
  g.fillStyle = TIP;
  g.font = "700 15px system-ui, sans-serif";
  g.textAlign = "left";
  g.fillText(`(x, y) = (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)}) cm`, point.x + 14, point.y - 12);
}

function labelAt(g: CanvasRenderingContext2D, color: string, text: string, at: Point, offset: number) {
  g.fillStyle = color;
  g.fillText(text, at.x, at.y + offset);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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
    hitTest: (px, py, state) => nearJoint(ctx, px, py, poseOf(state).elbow),
    onDrag(px, py) {
      const geometry = armGeometry(ctx);
      return { q1: wrapAngle(directionOf({ x: 0, y: 0 }, toWorld(geometry, px / geometry.canvasScale, py / geometry.canvasScale))) };
    },
  };
}

/** Dragging the tip turns link 2 about the elbow, leaving q1 alone. */
function tipHandle(ctx: SceneContext): Handle {
  return {
    id: "tip",
    params: ["q2"],
    hitTest: (px, py, state) => nearJoint(ctx, px, py, poseOf(state).tip),
    onDrag(px, py, state) {
      const geometry = armGeometry(ctx);
      const { elbow } = poseOf(state);
      const pointer = toWorld(geometry, px / geometry.canvasScale, py / geometry.canvasScale);
      return { q2: wrapAngle(directionOf(elbow, pointer) - (state.q1 as number)) };
    },
  };
}

function nearJoint(ctx: SceneContext, px: number, py: number, joint: Point): boolean {
  const geometry = armGeometry(ctx);
  const target = toScreen(geometry, joint);
  return Math.hypot(px / geometry.canvasScale - target.x, py / geometry.canvasScale - target.y) <= GRAB_RADIUS;
}
