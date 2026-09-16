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

/** Square centimetres in one square metre. */
export const SQ_CM_PER_SQ_M = 10_000;

/**
 * Area of the reachable annulus, in square centimetres. Subtracting the two
 * squared radii cancels the squared link lengths, so the area is always
 * 4 * PI * l1 * l2: it depends on the product of the links, not their sum.
 */
export function reachableArea(l1: number, l2: number): number {
  const { inner, outer } = reachableRadii(l1, l2);
  return Math.PI * (outer * outer - inner * inner);
}

/**
 * The reachable area divided by the product of the link lengths. The division
 * cancels both link lengths exactly, so this ratio is 4 * PI for every arm,
 * whatever the links are. Plotted against link length it is a flat line.
 */
export function normalizedArea(l1: number, l2: number): number {
  return reachableArea(l1, l2) / (l1 * l2);
}

/** The value normalizedArea always takes. */
export const NORMALIZED_AREA = 4 * Math.PI;

/** The same angle expressed in the half-open interval [0, TAU). */
export function wrapAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

/** The angle of the vector from `from` to `to`, measured from the positive x axis. */
export function directionOf(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}
