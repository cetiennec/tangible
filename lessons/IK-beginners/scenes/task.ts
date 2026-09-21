// A scripted pick and place for the SO-101 pair. The leader and the follower
// hold the same joint angles throughout, which is the point the narration makes
// just before: the follower is copying, not converting.

export interface TaskFrame {
  pan: number;
  lift: number;
  elbow: number;
  wristFlex: number;
  wristRoll: number;
  gripper: number;
  /** True while the jaws are closed on the brick. */
  holding: boolean;
}

const OPEN = 1.25;
const SHUT = 0.12;

interface Key {
  at: number;
  pose: [number, number, number, number, number, number];
}

/**
 * The four joints that reach; the wrist roll stays at zero throughout.
 *
 * Each pair below is the same point in space at three heights: on the brick,
 * three centimetres above it, and six. They were solved for rather than
 * guessed, by asking the arm's own forward kinematics which angles put the
 * gripper straight above the grasp point, holding shoulder lift plus elbow
 * plus wrist flex constant -- those three turn about parallel axes, so a
 * constant sum keeps the jaws at the same pitch all the way down.
 */
type Reach = [number, number, number, number];
const PICK_DOWN: Reach = [-0.55, -0.95, 1.45, 0.6];
const PICK_HALF: Reach = [-0.55, -1.1092, 1.2744, 0.9348];
const PICK_OVER: Reach = [-0.55, -1.1147, 1.0536, 1.1611];
const PLACE_DOWN: Reach = [0.5, -0.92, 1.42, 0.58];
const PLACE_HALF: Reach = [0.5, -1.0727, 1.2451, 0.9076];
const PLACE_OVER: Reach = [0.5, -1.0805, 1.0252, 1.1353];

const key = (at: number, reach: Reach, gripper: number): Key => ({ at, pose: [...reach, 0, gripper] });

/**
 * pan, lift, elbow, wrist flex, wrist roll, gripper.
 *
 * The arm stops above the brick, comes straight down onto it, lifts straight
 * back up, crosses at that height, and repeats the descent to put the brick
 * down. It used to run in along a diagonal instead, which drove the gripper
 * through the brick at both ends: five millimetres above the brick's centre
 * while already thirteen millimetres inside its footprint, so the jaws passed
 * through the thing they were reaching for.
 */
const KEYS: Key[] = [
  { at: 0.0, pose: [-0.55, -0.45, 0.95, 0.35, 0, OPEN] },
  key(0.14, PICK_OVER, OPEN),
  key(0.21, PICK_HALF, OPEN),
  key(0.28, PICK_DOWN, OPEN),
  key(0.36, PICK_DOWN, SHUT),
  key(0.43, PICK_HALF, SHUT),
  key(0.5, PICK_OVER, SHUT),
  key(0.62, PLACE_OVER, SHUT),
  key(0.69, PLACE_HALF, SHUT),
  key(0.76, PLACE_DOWN, SHUT),
  key(0.84, PLACE_DOWN, OPEN),
  key(0.89, PLACE_HALF, OPEN),
  key(0.94, PLACE_OVER, OPEN),
  { at: 1.0, pose: [0.5, -0.7, 0.95, 0.7, 0, OPEN] },
];

/** The grasp closes here and opens here; between the two the brick travels. */
export const GRASP_AT = 0.36;
export const RELEASE_AT = 0.84;

/**
 * Slopes for a shape-preserving cubic. Easing each segment on its own brought
 * the arm to a halt at every keyframe, which read as a stutter; this carries
 * speed through them. It is monotone, so a joint never overshoots a key and
 * flat runs stay exactly flat, which the grasp depends on.
 */
function slopes(times: number[], values: number[]): number[] {
  const n = values.length;
  const gaps = times.slice(1).map((t, i) => t - times[i]!);
  const deltas = values.slice(1).map((v, i) => (v - values[i]!) / gaps[i]!);
  const out = new Array<number>(n).fill(0);
  out[0] = deltas[0] ?? 0;
  out[n - 1] = deltas[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i += 1) {
    const before = deltas[i - 1]!;
    const after = deltas[i]!;
    // A turning point, or a flat run, gets a flat slope: no overshoot.
    if (before * after <= 0) {
      out[i] = 0;
      continue;
    }
    const w1 = 2 * gaps[i]! + gaps[i - 1]!;
    const w2 = gaps[i]! + 2 * gaps[i - 1]!;
    out[i] = (w1 + w2) / (w1 / before + w2 / after);
  }
  return out;
}

/** Hermite piece between two keys, given the slopes at each end. */
function hermite(t: number, t0: number, t1: number, v0: number, v1: number, m0: number, m1: number): number {
  const h = t1 - t0;
  if (h <= 0) return v1;
  const u = (t - t0) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * m1
  );
}

const TIMES = KEYS.map((key) => key.at);
const SLOPES = [0, 1, 2, 3, 4, 5].map((i) => slopes(TIMES, KEYS.map((key) => key.pose[i]!)));

/** The arms' pose at a point in the task, with both arms sharing it. */
export function taskFrame(progress: number): TaskFrame {
  const t = Math.min(1, Math.max(0, progress));
  let before = KEYS[0]!;
  let after = KEYS[KEYS.length - 1]!;
  for (let i = 0; i < KEYS.length - 1; i += 1) {
    if (t >= KEYS[i]!.at && t <= KEYS[i + 1]!.at) {
      before = KEYS[i]!;
      after = KEYS[i + 1]!;
      break;
    }
  }
  const lower = KEYS.indexOf(before);
  const upper = KEYS.indexOf(after);
  const at = (i: number) =>
    hermite(t, before.at, after.at, before.pose[i]!, after.pose[i]!, SLOPES[i]![lower]!, SLOPES[i]![upper]!);
  return {
    pan: at(0),
    lift: at(1),
    elbow: at(2),
    wristFlex: at(3),
    wristRoll: at(4),
    gripper: at(5),
    holding: t >= GRASP_AT && t < RELEASE_AT,
  };
}

/** The joint values in the order the scene's parameters expect. */
export const TASK_JOINTS = ["pan", "lift", "elbow", "wristFlex", "wristRoll", "gripper"] as const;
