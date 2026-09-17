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

/** pan, lift, elbow, wrist flex, wrist roll, gripper. */
const KEYS: Key[] = [
  { at: 0.0, pose: [-0.55, -0.45, 0.95, 0.35, 0, OPEN] },
  { at: 0.16, pose: [-0.55, -0.62, 1.2, 0.5, 0, OPEN] },
  { at: 0.26, pose: [-0.55, -0.95, 1.45, 0.6, 0, OPEN] },
  { at: 0.34, pose: [-0.55, -0.95, 1.45, 0.6, 0, SHUT] },
  { at: 0.46, pose: [-0.55, -0.5, 1.0, 0.4, 0, SHUT] },
  { at: 0.64, pose: [0.5, -0.5, 1.0, 0.4, 0, SHUT] },
  { at: 0.78, pose: [0.5, -0.92, 1.42, 0.58, 0, SHUT] },
  { at: 0.86, pose: [0.5, -0.92, 1.42, 0.58, 0, OPEN] },
  { at: 1.0, pose: [0.5, -0.4, 0.88, 0.3, 0, OPEN] },
];

/** The grasp closes here and opens here; between the two the brick travels. */
export const GRASP_AT = 0.34;
export const RELEASE_AT = 0.86;

const ease = (t: number) => t * t * (3 - 2 * t);

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
  const span = after.at - before.at;
  const blend = span <= 0 ? 0 : ease((t - before.at) / span);
  const at = (i: number) => before.pose[i]! + (after.pose[i]! - before.pose[i]!) * blend;
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
