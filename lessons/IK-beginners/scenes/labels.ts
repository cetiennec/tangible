// Diagram annotations. Which ones appear is decided by the narration, so the
// drawing only ever carries the labels the current sentence is talking about.
// Placement is kept here, away from the drawing code, so it can be tested.

import type { Point } from "./kinematics.js";

export interface LabelStyle {
  ink: string;
  muted: string;
  link1: string;
  link2: string;
  tip: string;
}

export interface LabelFlags {
  motors: boolean;
  angles: boolean;
  links: boolean;
  tip: boolean;
  dof: boolean;
}

export interface Label {
  key: string;
  text: string;
  x: number;
  y: number;
  align: "left" | "center" | "right";
  size: number;
  weight: number;
  color: string;
  /** Half-width and half-height used for placement, in layout pixels. */
  width: number;
}

export interface ScreenPose {
  base: Point;
  elbow: Point;
  tip: Point;
  /** Radius of the angle arc drawn at each joint. */
  baseArc: number;
  elbowArc: number;
}

const HALF_PI = Math.PI / 2;

/** Roughly how wide a string renders, which is all the placement needs. */
export function textWidth(text: string, size: number): number {
  return text.length * size * 0.56;
}

/**
 * A point offset perpendicular to a link, on the far side from the angle arc,
 * so the length label and the angle label never sit on top of each other.
 */
function besideLink(from: Point, to: Point, worldAngle: number, arcSide: number, along: number, gap: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const away = worldAngle + arcSide * HALF_PI;
  return { x: from.x + dx * along + Math.cos(away) * gap, y: from.y + dy * along - Math.sin(away) * gap };
}

/** Every annotation the drawing should show, already positioned. */
export function armLabels(
  pose: ScreenPose,
  angles: { q1: number; q2: number },
  lengths: { l1: number; l2: number },
  world: Point,
  flags: LabelFlags,
  style: LabelStyle,
): Label[] {
  const labels: Label[] = [];
  const add = (key: string, text: string, x: number, y: number, color: string, size = 13, weight = 600, align: "left" | "center" | "right" = "center") =>
    labels.push({ key, text, x, y, align, size, weight, color, width: textWidth(text, size) });

  if (flags.angles) {
    const q1At = { x: pose.base.x + (pose.baseArc + 17) * Math.cos(angles.q1 / 2), y: pose.base.y - (pose.baseArc + 17) * Math.sin(angles.q1 / 2) };
    const bisector2 = angles.q1 + angles.q2 / 2;
    const q2At = { x: pose.elbow.x + (pose.elbowArc + 17) * Math.cos(bisector2), y: pose.elbow.y - (pose.elbowArc + 17) * Math.sin(bisector2) };
    // Symbols only: the control panel carries every number already, and full
    // readouts here are as wide as the arm is long.
    add("q1", "q₁", q1At.x, q1At.y, style.link1, 15, 700);
    add("q2", "q₂", q2At.x, q2At.y, style.link2, 15, 700);
  }

  if (flags.links) {
    // The base arc always sweeps anticlockwise from the x axis, so it lies on
    // one fixed side of link 1; the elbow arc follows the sign of q2.
    // Sit well down each link and well off to one side, so the length label
    // clears both its own joint and the angle label drawn against the arc.
    const l1At = besideLink(pose.base, pose.elbow, angles.q1, 1, 0.74, 22);
    const l2At = besideLink(pose.elbow, pose.tip, angles.q1 + angles.q2, Math.sin(angles.q2) >= 0 ? 1 : -1, 0.74, 22);
    add("l1", "L₁", l1At.x, l1At.y, style.link1, 14, 700);
    add("l2", "L₂", l2At.x, l2At.y, style.link2, 14, 700);
  }

  if (flags.dof) {
    // Sits under the base, clear of the arm whichever way it is pointing.
    add("dof", "2 DOF", pose.base.x, pose.base.y + 42, style.muted, 12, 700);
  }

  if (flags.tip) {
    // Push the readout straight out beyond the tip, away from the arm, so it
    // never lands on the joints or their angle labels.
    const dx = pose.tip.x - pose.elbow.x;
    const dy = pose.tip.y - pose.elbow.y;
    const len = Math.hypot(dx, dy) || 1;
    const anchor = { x: pose.tip.x + (dx / len) * 20, y: pose.tip.y + (dy / len) * 20 };
    const align = dx >= 0 ? "left" : "right";
    add("tipName", "end-effector", anchor.x, anchor.y - 11, style.tip, 13, 700, align);
    add("tipValue", `(${world.x.toFixed(1)}, ${world.y.toFixed(1)}) cm`, anchor.x, anchor.y + 7, style.tip, 14, 700, align);
  }

  return labels;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function labelBox(label: Label): Box {
  const height = label.size + 4;
  const x0 =
    label.align === "center" ? label.x - label.width / 2 : label.align === "right" ? label.x - label.width : label.x;
  return { x0, x1: x0 + label.width, y0: label.y - height / 2, y1: label.y + height / 2 };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

// Callouts around points on screen, for naming several joints at once.
export type Side = "above" | "below" | "right" | "left";
export interface Callout {
  side: Side;
  /** How far out from the point: 0 sits next to it, each step moves one callout height further. */
  level: number;
}
const SIDES: Side[] = ["above", "below", "right", "left"];
const CALLOUT_GAP = 6;
const MAX_LEVEL = 4;

/** Distance from the point to the near edge of a callout at this level. */
export function calloutGap(height: number, level: number): number {
  return CALLOUT_GAP + level * (height + 2);
}

/** The box a callout of this size covers on one side of its point. */
export function calloutBox(x: number, y: number, width: number, height: number, { side, level }: Callout): Box {
  const gap = calloutGap(height, level);
  if (side === "above") return { x0: x - width / 2, x1: x + width / 2, y0: y - gap - height, y1: y - gap };
  if (side === "below") return { x0: x - width / 2, x1: x + width / 2, y0: y + gap, y1: y + gap + height };
  if (side === "right") return { x0: x + gap, x1: x + gap + width, y0: y - height / 2, y1: y + height / 2 };
  return { x0: x - gap - width, x1: x - gap, y0: y - height / 2, y1: y + height / 2 };
}

/**
 * Put each callout, in order, as close to its point as it can go without
 * overlapping those already placed: every side next to the point first, then
 * every side one step further out, and so on.
 */
export function placeCallouts(items: { x: number; y: number; width: number; height: number }[]): Callout[] {
  const placed: Box[] = [];
  return items.map(({ x, y, width, height }) => {
    const options = Array.from({ length: MAX_LEVEL + 1 }, (_, level) => SIDES.map((side) => ({ side, level }))).flat();
    const choice = options.find((option) => !placed.some((box) => boxesOverlap(box, calloutBox(x, y, width, height, option))))
      ?? { side: "above" as const, level: MAX_LEVEL };
    placed.push(calloutBox(x, y, width, height, choice));
    return choice;
  });
}
