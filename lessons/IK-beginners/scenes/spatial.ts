// A five-jointed arm in three dimensions, held on a fixed point by a numerical
// solver. Five joints against three coordinates leaves a two-dimensional family
// of poses, so the arm can writhe while the tip stays put. Kept free of any
// renderer so the solver can be tested on its own.

export type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

/**
 * Built like a real manipulator rather than a free chain: a turntable at the
 * base carrying a column, then a shoulder, elbow and two wrist joints that all
 * bend in the same plane. That plane is what the turntable swings around, which
 * is how most arms are laid out and what makes one read as an arm.
 */
const AXES: Vec3[] = [
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, 1],
  [0, 0, 1],
  [0, 0, 1],
];
/** Where each joint sits relative to the one before it. */
const OFFSETS: Vec3[] = [
  [0, 0.34, 0],
  [0.58, 0, 0],
  [0.5, 0, 0],
  [0.3, 0, 0],
  [0.18, 0, 0],
];
/** Keeps the arm in poses a real one could hold: the shoulder never dives
 * below its own base, and no joint doubles back on itself. */
const LIMITS: [number, number][] = [
  [-2.4, 2.4],
  [0.05, 1.9],
  [-2.5, -0.15],
  [-2.0, 2.0],
  [-2.2, 2.2],
];
const SEED = [0.5, 1.15, -1.55, 0.7, 0.2];

function clamp(angles: number[]): number[] {
  return angles.map((value, i) => Math.min(LIMITS[i]![1], Math.max(LIMITS[i]![0], value)));
}
/** The direction the arm reconfigures along while holding its tip still. */
const WALK = [1, -0.7, 1.1, -0.9, 0.6];
const SELF_MOTION_STEPS = 40;
const SELF_MOTION_SPAN = 2.6;

export const TARGET: Vec3 = [0.86, 0.54, 0.3];

export interface SpatialPose {
  joints: Vec3[];
  tip: Vec3;
  angles: number[];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

function rotation(axis: Vec3, angle: number): Mat3 {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = 1 - c;
  return [
    [c + x * x * k, x * y * k - z * s, x * z * k + y * s],
    [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
    [z * x * k - y * s, z * y * k + x * s, c + z * z * k],
  ];
}

function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function multiply(a: Mat3, b: Mat3): Mat3 {
  const out: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      out[i]![j] = a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!;
    }
  }
  return out;
}

/** Joint positions and the tip, for a set of joint angles. */
export function spatialFk(angles: number[]): SpatialPose {
  let frame: Mat3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  let at: Vec3 = [0, 0, 0];
  const joints: Vec3[] = [at];
  for (let i = 0; i < AXES.length; i += 1) {
    frame = multiply(frame, rotation(AXES[i]!, angles[i] ?? 0));
    const step = apply(frame, OFFSETS[i]!);
    at = [at[0] + step[0], at[1] + step[1], at[2] + step[2]];
    joints.push(at);
  }
  return { joints, tip: at, angles: [...angles] };
}

/** World axis of each joint, for drawing the housings along them. */
export function jointAxes(angles: number[]): Vec3[] {
  let frame: Mat3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const axes: Vec3[] = [];
  for (let i = 0; i < AXES.length; i += 1) {
    axes.push(apply(frame, AXES[i]!));
    frame = multiply(frame, rotation(AXES[i]!, angles[i] ?? 0));
  }
  return axes;
}

/** World axis of every joint, needed for the Jacobian. */
function worldAxes(angles: number[]): Vec3[] {
  let frame: Mat3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const axes: Vec3[] = [];
  for (let i = 0; i < AXES.length; i += 1) {
    axes.push(apply(frame, AXES[i]!));
    frame = multiply(frame, rotation(AXES[i]!, angles[i] ?? 0));
  }
  return axes;
}

/**
 * How the tip moves for a small turn of each joint: three rows, one per
 * coordinate, and one column per joint.
 */
export function jacobian(pose: SpatialPose): number[][] {
  const axes = worldAxes(pose.angles);
  const columns = axes.map((axis, i) => cross(axis, sub(pose.tip, pose.joints[i]!)));
  return [0, 1, 2].map((row) => columns.map((column) => column[row]!));
}

/** Damped least squares: the smallest joint change that closes most of the gap. */
function step(rows: number[][], error: Vec3, damping: number): number[] {
  const n = rows[0]!.length;
  // J * J^T is only three by three, so it can be inverted directly.
  const m: number[][] = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => {
      let sum = i === j ? damping * damping : 0;
      for (let k = 0; k < n; k += 1) sum += rows[i]![k]! * rows[j]![k]!;
      return sum;
    }),
  );
  const det =
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
    m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
    m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  if (Math.abs(det) < 1e-12) return new Array(n).fill(0);
  const inv = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => {
      const a = (r: number, c: number) => m[r]![c]!;
      const r1 = (j + 1) % 3;
      const r2 = (j + 2) % 3;
      const c1 = (i + 1) % 3;
      const c2 = (i + 2) % 3;
      return (a(r1, c1) * a(r2, c2) - a(r1, c2) * a(r2, c1)) / det;
    }),
  );
  const weighted: Vec3 = [0, 1, 2].map((i) =>
    inv[i]!.reduce((sum, value, j) => sum + value * error[j]!, 0),
  ) as Vec3;
  return Array.from({ length: n }, (_unused, k) =>
    [0, 1, 2].reduce((sum, row) => sum + rows[row]![k]! * weighted[row]!, 0),
  );
}

/** Pull the tip onto the target from wherever it is. */
function converge(angles: number[]): number[] {
  let q = [...angles];
  for (let i = 0; i < 60; i += 1) {
    const pose = spatialFk(q);
    const error = sub(TARGET, pose.tip);
    if (norm(error) < 1e-12) break;
    const delta = step(jacobian(pose), error, 0.05);
    q = clamp(q.map((value, k) => value + delta[k]!));
  }
  return q;
}

/** How the tip would move for a given turn of every joint. */
function tipVelocity(rows: number[][], joints: number[]): Vec3 {
  return [0, 1, 2].map((row) => rows[row]!.reduce((sum, value, k) => sum + value * joints[k]!, 0)) as Vec3;
}

/**
 * One member of the family, chosen by `spread`. The arm is walked along the
 * null space of its own Jacobian: the combination of joint turns that leaves
 * the tip exactly where it is. That is what a redundant arm can do freely, and
 * it looks like the arm rearranging itself around a fixed hand.
 */
export function solveSpatial(spread: number): SpatialPose {
  let q = converge(SEED);
  const rate = (spread * SELF_MOTION_SPAN) / SELF_MOTION_STEPS;
  for (let i = 0; i < SELF_MOTION_STEPS; i += 1) {
    const pose = spatialFk(q);
    const rows = jacobian(pose);
    // Remove the part of the walk that would move the tip, leaving self-motion.
    const correction = step(rows, tipVelocity(rows, WALK), 0.02);
    q = clamp(q.map((value, k) => value + rate * (WALK[k]! - correction[k]!)));
    // Nudge back onto the target, against the drift a finite step leaves.
    const after = spatialFk(q);
    const fix = step(jacobian(after), sub(TARGET, after.tip), 0.02);
    q = clamp(q.map((value, k) => value + fix[k]!));
  }
  return spatialFk(converge(q));
}
