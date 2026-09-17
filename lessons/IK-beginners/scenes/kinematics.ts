// Forward kinematics for a planar two-link arm. DOM-free so it can be unit tested.

export interface Point {
  x: number;
  y: number;
}

export interface ArmPose {
  base: Point;
  elbow: Point;
  tip: Point;
}

export const TAU = Math.PI * 2;

/** Link lengths are centimetres; the workspace is drawn for the longest possible arm. */
export const MIN_LINK_CM = 3;
export const MAX_LINK_CM = 12;
export const MAX_REACH_CM = MAX_LINK_CM * 2;

/**
 * Joint positions for angles in radians, with q1 measured from the positive x
 * axis and q2 measured from link 1 rather than from the axis.
 */
export function forwardKinematics(q1: number, q2: number, l1: number, l2: number): ArmPose {
  const elbow = { x: l1 * Math.cos(q1), y: l1 * Math.sin(q1) };
  const tip = { x: elbow.x + l2 * Math.cos(q1 + q2), y: elbow.y + l2 * Math.sin(q1 + q2) };
  return { base: { x: 0, y: 0 }, elbow, tip };
}

/**
 * Inner and outer radii of the annulus the tip can reach. Both joints turn a
 * full revolution, so every point between the two radii is reachable.
 */
export function reachableRadii(l1: number, l2: number) {
  return { inner: Math.abs(l1 - l2), outer: l1 + l2 };
}

/** The same angle expressed in the half-open interval [0, TAU). */
export function wrapAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

/**
 * The same angle expressed in (-PI, PI]. The elbow is held this way, because
 * bending one way or the other is then simply the sign of the angle.
 */
export function wrapSigned(angle: number): number {
  const shifted = (angle + Math.PI) % TAU;
  return (shifted <= 0 ? shifted + Math.PI : shifted - Math.PI);
}

/**
 * Area of the reachable annulus, in square centimetres. Subtracting the two
 * squared radii cancels the squared link lengths, so the area is always
 * 4 * PI * l1 * l2: it depends on the product of the links, not their sum.
 * Maximising it while link 2 may not exceed link 1 therefore puts the optimum
 * on the boundary, at equal links.
 */
export function reachableArea(l1: number, l2: number): number {
  const { inner, outer } = reachableRadii(l1, l2);
  return Math.PI * (outer * outer - inner * inner);
}

/**
 * A circle for the end-effector to trace, sized and placed to sit inside the
 * reachable annulus for any link lengths. The centre is lifted away from the
 * positive x axis because a circle placed there drives q1 through zero, and a
 * joint angle held in [0, TAU) would jump a whole turn part-way round.
 */
export function circlePath(l1: number, l2: number) {
  const { inner, outer } = reachableRadii(l1, l2);
  const distance = (inner + outer) / 2;
  const direction = (120 * Math.PI) / 180;
  return {
    centre: { x: distance * Math.cos(direction), y: distance * Math.sin(direction) },
    radius: (outer - inner) * 0.25,
  };
}

/** A point on that circle, with the turn measured in fractions of a full lap. */
export function circlePoint(l1: number, l2: number, lap: number): Point {
  const { centre, radius } = circlePath(l1, l2);
  return { x: centre.x + radius * Math.cos(lap * TAU), y: centre.y + radius * Math.sin(lap * TAU) };
}

/**
 * A handful of points the tip cannot reach, for the narration to point at.
 * Some lie beyond the outer edge, and some inside the dead zone at the centre,
 * which is the case people tend to forget: a target can be too close as well
 * as too far. The inner ones are omitted when the links are equal, because
 * then there is no dead zone.
 */
export function unreachableSamples(l1: number, l2: number): Point[] {
  const { inner, outer } = reachableRadii(l1, l2);
  const beyond = [0.6, 2.1, 3.9, 5.4].map((angle) => ({
    x: outer * 1.18 * Math.cos(angle),
    y: outer * 1.18 * Math.sin(angle),
  }));
  if (inner < 1) return beyond;
  const within = [1.3, 4.6].map((angle) => ({
    x: inner * 0.45 * Math.cos(angle),
    y: inner * 0.45 * Math.sin(angle),
  }));
  return [...beyond, ...within];
}

/**
 * Which of the two solutions an elbow angle represents. "up" is the solution
 * where the elbow bends counterclockwise, meaning the sine of q2 is positive.
 * A straight or fully folded arm sits on the boundary, where both agree.
 */
export type ElbowBranch = "up" | "down";

export function elbowBranch(q2: number): ElbowBranch {
  return Math.sin(q2) >= 0 ? "up" : "down";
}

/** The nearest point to `target` that the tip can actually reach. */
export function clampToReach(target: Point, l1: number, l2: number): Point {
  const { inner, outer } = reachableRadii(l1, l2);
  const radius = Math.hypot(target.x, target.y);
  if (radius >= inner && radius <= outer) return target;
  // At the exact centre no direction is preferred, so pick the positive x axis.
  if (radius === 0) return { x: inner, y: 0 };
  const scale = (radius < inner ? inner : outer) / radius;
  return { x: target.x * scale, y: target.y * scale };
}

/**
 * Joint angles that put the tip on a target: the inverse of forwardKinematics.
 * Every reachable point except the two boundary circles has exactly two
 * solutions, and `branch` chooses between them. Unreachable targets are pulled
 * to the nearest reachable point first, so this always returns a real pose.
 */
export function inverseKinematics(target: Point, l1: number, l2: number, branch: ElbowBranch) {
  const reached = clampToReach(target, l1, l2);
  const cosQ2 = (reached.x * reached.x + reached.y * reached.y - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  // Rounding can push a boundary target a hair outside the valid cosine range.
  const cosine = Math.min(1, Math.max(-1, cosQ2));
  const sine = Math.sqrt(1 - cosine * cosine) * (branch === "up" ? 1 : -1);
  const q2 = Math.atan2(sine, cosine);
  const q1 = Math.atan2(reached.y, reached.x) - Math.atan2(l2 * sine, l1 + l2 * cosine);
  return { q1: wrapAngle(q1), q2: wrapSigned(q2), reached };
}

/** The angle of the vector from `from` to `to`, measured from the positive x axis. */
export function directionOf(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}
