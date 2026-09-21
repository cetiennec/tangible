import { describe, expect, it } from "vitest";
import { GRASP_AT, RELEASE_AT, taskFrame } from "./task.js";

describe("the scripted pick and place", () => {
  it("holds the brick only between closing and opening the jaws", () => {
    expect(taskFrame(0).holding).toBe(false);
    expect(taskFrame(GRASP_AT - 0.01).holding).toBe(false);
    expect(taskFrame(GRASP_AT).holding).toBe(true);
    expect(taskFrame(0.6).holding).toBe(true);
    expect(taskFrame(RELEASE_AT).holding).toBe(false);
    expect(taskFrame(1).holding).toBe(false);
  });

  it("keeps the arm still while the jaws close, so the brick is not knocked", () => {
    const before = taskFrame(0.28);
    const after = taskFrame(GRASP_AT);
    for (const key of ["pan", "lift", "elbow", "wristFlex"] as const) {
      expect(after[key]).toBeCloseTo(before[key], 6);
    }
    expect(after.gripper).toBeLessThan(before.gripper);
  });

  it("comes down onto the brick and lifts away along the same line", () => {
    // The descent and the lift pass through the same poses in reverse, at
    // both ends of the task, so the gripper travels one vertical line down
    // and the same one back up rather than swinging in from the side.
    const pairs = [[0.14, 0.5], [0.21, 0.43], [0.62, 0.94], [0.69, 0.89]];
    for (const [down, up] of pairs) {
      for (const joint of ["pan", "lift", "elbow", "wristFlex"] as const) {
        expect(taskFrame(down!)[joint]).toBeCloseTo(taskFrame(up!)[joint], 6);
      }
    }
  });

  it("only swings sideways at its hovering height, never across the table", () => {
    // The shoulder turns between the two hovering keyframes and nowhere
    // else, so the gripper is well clear of both spots whenever it moves
    // horizontally.
    for (let i = 0; i <= 100; i += 1) {
      const t = i / 100;
      if (t <= 0.5) expect(taskFrame(t).pan).toBeCloseTo(-0.55, 6);
      if (t >= 0.62) expect(taskFrame(t).pan).toBeCloseTo(0.5, 6);
    }
  });

  it("swings across only while the brick is held", () => {
    expect(taskFrame(0.46).pan).toBeLessThan(0);
    expect(taskFrame(0.64).pan).toBeGreaterThan(0);
    expect(taskFrame(0.46).holding).toBe(true);
    expect(taskFrame(0.64).holding).toBe(true);
  });

  it("moves smoothly, with no jump between neighbouring moments", () => {
    let previous = taskFrame(0);
    for (let i = 1; i <= 200; i += 1) {
      const frame = taskFrame(i / 200);
      for (const key of ["pan", "lift", "elbow", "wristFlex", "gripper"] as const) {
        expect(Math.abs(frame[key] - previous[key])).toBeLessThan(0.12);
      }
      previous = frame;
    }
  });

  it("carries its speed through the keyframes instead of stopping at each one", () => {
    const speed = (t: number) => {
      const a = taskFrame(Math.max(0, t - 0.002));
      const b = taskFrame(Math.min(1, t + 0.002));
      return (["pan", "lift", "elbow", "wristFlex"] as const).reduce((sum, k) => sum + Math.abs(b[k] - a[k]), 0) / 0.004;
    };
    // Mid-descent and mid-swing the arm should still be moving. Easing every
    // segment on its own brought it to a halt here, which read as a stutter.
    expect(speed(0.16)).toBeGreaterThan(1);
    expect(speed(0.55)).toBeGreaterThan(1);
    // At the grasp and the release it should be still, so the brick is not knocked.
    expect(speed(0.3)).toBeLessThan(0.5);
    expect(speed(0.82)).toBeLessThan(0.5);
  });

  it("stays inside the joint ranges the SO-101 declares", () => {
    const limits = { pan: 1.91986, lift: 1.74533, elbow: 1.69, wristFlex: 1.65806, wristRoll: 2.74385 };
    for (let i = 0; i <= 100; i += 1) {
      const frame = taskFrame(i / 100);
      for (const [key, bound] of Object.entries(limits)) {
        expect(Math.abs(frame[key as keyof typeof limits])).toBeLessThanOrEqual(bound);
      }
      expect(frame.gripper).toBeLessThanOrEqual(1.74533);
      expect(frame.gripper).toBeGreaterThanOrEqual(-0.17453);
    }
  });
});
