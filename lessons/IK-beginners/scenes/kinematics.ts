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
 * Joint limits standing in for a real robot's. They are deliberately not
 * symmetric: a shoulder does not sweep evenly about zero, and an elbow bends a
 * long way one direction and almost none the other, as yours does.
 */
export const JOINT_LIMITS = { q1: [0.25, 2.85] as const, q2: [-2.6, 1.15] as const };

/** The free elbow, for describing the arm before limits are introduced. */
export const FREE_ELBOW = [-Math.PI, Math.PI] as const;

/**
 * Nearest and furthest the tip can get, for any elbow range. The tip is
 * furthest when the elbow is closest to straight and nearest when it is
 * closest to folded, so the extremes of the cosine over the range decide both.
 */
export function limitedRadii(l1: number, l2: number, elbow: readonly [number, number] = FREE_ELBOW) {
  const [low, high] = elbow;
  const spansFolded = (low <= -Math.PI && high >= -Math.PI) || (low <= Math.PI && high >= Math.PI);
  const spansStraight = low <= 0 && high >= 0;
  const minCos = spansFolded ? -1 : Math.min(Math.cos(low), Math.cos(high));
  const maxCos = spansStraight ? 1 : Math.max(Math.cos(low), Math.cos(high));
  const radius = (cosine: number) => Math.sqrt(Math.max(0, l1 * l1 + l2 * l2 + 2 * l1 * l2 * cosine));
  return { inner: radius(minCos), outer: radius(maxCos) };
}

/**
 * How much of the circle it could sweep the arm can actually reach: one when
 * the dead zone closes completely, less as the links grow unequal. This is the
 * quantity that peaks at equal links, whereas the area simply grows with both.
 */
export function reachCoverage(l1: number, l2: number, elbow: readonly [number, number] = FREE_ELBOW): number {
  const { inner, outer } = limitedRadii(l1, l2, elbow);
  return outer === 0 ? 0 : 1 - (inner / outer) ** 2;
}

/**
 * A circle for the end-effector to trace, sized and placed to sit inside the
 * reachable annulus for any link lengths. The centre is lifted away from the
 * positive x axis because a circle placed there drives q1 through zero, and a
 * joint angle held in [0, TAU) would jump a whole turn part-way round.
 *
 * The radius is smaller than the annulus alone requires: at equal link
 * lengths, the one shape this circle is actually baked and driven through,
 * a bigger circle dips outside JOINT_LIMITS.q2 by a couple of degrees over
 * part of the lap. The narration claims every point on this path is a pose
 * the motors can genuinely hold; kinematics.test.ts checks that at L1=L2.
 */
export function circlePath(l1: number, l2: number) {
  const { inner, outer } = reachableRadii(l1, l2);
  const distance = (inner + outer) / 2;
  const direction = (45 * Math.PI) / 180;
  return {
    centre: { x: distance * Math.cos(direction), y: distance * Math.sin(direction) },
    radius: (outer - inner) * 0.2,
  };
}

/** A point on that circle, with the turn measured in fractions of a full lap. */
export function circlePoint(l1: number, l2: number, lap: number): Point {
  const { centre, radius } = circlePath(l1, l2);
  return { x: centre.x + radius * Math.cos(lap * TAU), y: centre.y + radius * Math.sin(lap * TAU) };
}

/**
 * A second, open trajectory: not a loop, and not one continuous curvature
 * like the circle, so tracing it makes the same point about a different
 * shape rather than repeating the first demonstration. Unlike circlePath,
 * this is not sized generically from the link lengths — it is a fixed path
 * in Cartesian space, tuned for the equal link lengths it is actually baked
 * and driven through (the same L1=L2 the circle uses). Every point of it is
 * reachable, and kinematics.test.ts checks that: it is the path the arm
 * follows from end to end, before wideCirclePath shows one it cannot.
 */
export function wavePoint(t: number): Point {
  const x0 = 11.5, x1 = 3.0, yMid = 19.6, amplitude = 1, cycles = 1.5;
  return { x: x0 + t * (x1 - x0), y: yMid + amplitude * Math.sin(t * TAU * cycles) };
}

/**
 * A larger circle, further out, whose far side falls outside what the arm
 * can reach. Asking for this one and watching the arm stop partway is how
 * the narration makes the point that a whole path has to be reachable, not
 * just its ends; circlePath is then the same idea drawn small enough to fit.
 */
export function wideCirclePath(l1: number, l2: number) {
  const { outer } = limitedRadii(l1, l2, JOINT_LIMITS.q2);
  const direction = (45 * Math.PI) / 180;
  const distance = outer * 0.76;
  return {
    centre: { x: distance * Math.cos(direction), y: distance * Math.sin(direction) },
    radius: outer * 0.33,
    direction,
  };
}

/**
 * A point on that circle. The lap starts at the point nearest the base and
 * runs outward from there, so the arm traces a real arc of it before the
 * path climbs past the edge of its reach.
 */
export function wideCirclePoint(l1: number, l2: number, lap: number): Point {
  const { centre, radius, direction } = wideCirclePath(l1, l2);
  const angle = direction + Math.PI + lap * TAU;
  return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
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
 * A handful of points the tip can reach, for the narration to point at while
 * it says every such point has two solutions. They are spread around the ring
 * and set at different distances, so none of them looks like a special case.
 */
export function reachableSamples(l1: number, l2: number): Point[] {
  const { inner, outer } = reachableRadii(l1, l2);
  const between = (fraction: number) => inner + (outer - inner) * fraction;
  return [
    { angle: 0.85, radius: between(0.5) },
    { angle: 2.35, radius: between(0.74) },
    { angle: 3.75, radius: between(0.34) },
    { angle: 5.15, radius: between(0.6) },
  ].map(({ angle, radius }) => ({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) }));
}

/** True when a pose lies inside the travel the motors actually have. */
export function withinJointLimits(q1: number, q2: number): boolean {
  const [q1Low, q1High] = JOINT_LIMITS.q1;
  const [q2Low, q2High] = JOINT_LIMITS.q2;
  return q1 >= q1Low && q1 <= q1High && q2 >= q2Low && q2 <= q2High;
}

/**
 * Stop each joint at its own stop, independently of the other. This is what a
 * real motor does: it does not know or care what the other joint is doing, it
 * simply refuses to turn past its own limit.
 */
export function clampToJointLimits(q1: number, q2: number): { q1: number; q2: number } {
  const [q1Low, q1High] = JOINT_LIMITS.q1;
  const [q2Low, q2High] = JOINT_LIMITS.q2;
  return {
    q1: Math.min(q1High, Math.max(q1Low, q1)),
    q2: Math.min(q2High, Math.max(q2Low, q2)),
  };
}

/**
 * Points that still have both elbow solutions once the joint limits apply.
 * Far fewer than the open ring offers, so these are searched for rather than
 * placed by hand: with equal links only about a tenth of the ring keeps both.
 * `clearance` keeps the samples away from the limit edges, so a pose the
 * narration calls legal does not sit a hair inside a stop.
 */
export function twoSolutionSamples(l1: number, l2: number, count = 4, clearance = 0.12): Point[] {
  const { outer } = reachableRadii(l1, l2);
  const found: { point: Point; angle: number }[] = [];
  for (let step = 0; step < 720; step++) {
    const angle = (step / 720) * TAU;
    for (let ring = 0.95; ring > 0.1; ring -= 0.02) {
      const point = { x: outer * ring * Math.cos(angle), y: outer * ring * Math.sin(angle) };
      const up = inverseKinematics(point, l1, l2, "up");
      const down = inverseKinematics(point, l1, l2, "down");
      // A target inside the dead zone gets clamped, so the pose would not
      // actually stand where the dot is drawn.
      if (Math.hypot(up.reached.x - point.x, up.reached.y - point.y) > 1e-6) continue;
      if (!bothClear(up, down, clearance)) continue;
      found.push({ point, angle });
      break;
    }
  }
  return spreadByAngle(found, count);
}

/**
 * Picks `count` candidates as far apart in angle as possible, rather than
 * assuming the survivors are evenly spaced through the array. The valid
 * region for "exactly one solution" is large enough to wrap past 0/TAU, and
 * picking evenly by array index then puts the first and last picks right
 * next to each other on the ring.
 */
function spreadByAngle(candidates: { point: Point; angle: number }[], count: number): Point[] {
  if (candidates.length === 0) return [];
  const angularDistance = (a: number, b: number) => {
    const diff = Math.abs(a - b) % TAU;
    return Math.min(diff, TAU - diff);
  };
  const chosen = [candidates[0]!];
  while (chosen.length < Math.min(count, candidates.length)) {
    let best = candidates[0]!;
    let bestDistance = -1;
    for (const candidate of candidates) {
      const distance = Math.min(...chosen.map((c) => angularDistance(c.angle, candidate.angle)));
      if (distance > bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    chosen.push(best);
  }
  return chosen.map((c) => c.point);
}

/** How far inside the limits a pose sits, in radians on the tighter axis. */
function limitClearance(pose: { q1: number; q2: number }): number {
  const [q1Low, q1High] = JOINT_LIMITS.q1;
  const [q2Low, q2High] = JOINT_LIMITS.q2;
  return Math.min(pose.q1 - q1Low, q1High - pose.q1, pose.q2 - q2Low, q2High - pose.q2);
}

function bothClear(
  up: { q1: number; q2: number },
  down: { q1: number; q2: number },
  clearance: number,
): boolean {
  return limitClearance(up) >= clearance && limitClearance(down) >= clearance;
}

/**
 * Points reachable only one of the two ways once the joint limits apply: the
 * more common case, and the one the narration calls "most points keep just
 * one." `clearance` keeps the valid branch clear of its own limit edge and
 * the blocked branch clearly outside, so the example is not a boundary case
 * that would flip with the next frame's rounding.
 */
export function oneSolutionSamples(l1: number, l2: number, count = 4, clearance = 0.12): Point[] {
  const { outer } = reachableRadii(l1, l2);
  const found: { point: Point; angle: number }[] = [];
  for (let step = 0; step < 720; step++) {
    const angle = (step / 720) * TAU;
    for (let ring = 0.95; ring > 0.1; ring -= 0.02) {
      const point = { x: outer * ring * Math.cos(angle), y: outer * ring * Math.sin(angle) };
      const up = inverseKinematics(point, l1, l2, "up");
      const down = inverseKinematics(point, l1, l2, "down");
      const upReaches = Math.hypot(up.reached.x - point.x, up.reached.y - point.y) < 1e-6;
      const downReaches = Math.hypot(down.reached.x - point.x, down.reached.y - point.y) < 1e-6;
      const upOk = upReaches && limitClearance(up) >= clearance;
      const downOk = downReaches && limitClearance(down) >= clearance;
      if (upOk === downOk) continue; // both or neither: not the "just one" case
      const blocked = upOk ? down : up;
      const blockedReaches = upOk ? downReaches : upReaches;
      // The blocked branch should be clearly outside, not perched on the edge.
      if (blockedReaches && limitClearance(blocked) > -clearance) continue;
      found.push({ point, angle });
      break;
    }
  }
  return spreadByAngle(found, count);
}

/**
 * Which of the two solutions an elbow angle represents, named for where the
 * elbow actually sits: "up" puts it above the line from shoulder to hand.
 * A negative q2 is what does that, since turning the elbow the positive way
 * drops it below that line.
 */
export type ElbowBranch = "up" | "down";

export function elbowBranch(q2: number): ElbowBranch {
  return Math.sin(q2) <= 0 ? "up" : "down";
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
  const sine = Math.sqrt(1 - cosine * cosine) * (branch === "up" ? -1 : 1);
  const q2 = Math.atan2(sine, cosine);
  const q1 = Math.atan2(reached.y, reached.x) - Math.atan2(l2 * sine, l1 + l2 * cosine);
  return { q1: wrapAngle(q1), q2: wrapSigned(q2), reached };
}

/** The angle of the vector from `from` to `to`, measured from the positive x axis. */
/**
 * The stretch of the wide circle the arm cannot do, in lap fractions:
 * `from` is where it has to stop, `to` is where the path comes back inside
 * its reach. Between those two there are no joint angles at all; after `to`
 * the path is fine again, but the arm never gets there, having stopped.
 *
 * Walked rather than solved for, because the boundary is set by the reach
 * and the joint limits together and either can be the one that bites first.
 * An empty stretch (`from` and `to` both 1) means the whole lap is fine.
 */
export function wideCircleGap(l1: number, l2: number): { from: number; to: number } {
  const { inner, outer } = reachableRadii(l1, l2);
  const steps = 400;
  const reachable = (lap: number) => {
    const point = wideCirclePoint(l1, l2, lap);
    const distance = Math.hypot(point.x, point.y);
    if (distance > outer || distance < inner) return false;
    const solved = inverseKinematics(point, l1, l2, "up");
    return withinJointLimits(solved.q1, solved.q2);
  };
  let step = 0;
  while (step <= steps && reachable(step / steps)) step += 1;
  if (step > steps) return { from: 1, to: 1 };
  const from = Math.max(0, step - 1) / steps;
  while (step <= steps && !reachable(step / steps)) step += 1;
  return { from, to: Math.min(1, step / steps) };
}

export function directionOf(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}
