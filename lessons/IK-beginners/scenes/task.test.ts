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
    const before = taskFrame(0.26);
    const after = taskFrame(GRASP_AT);
    for (const key of ["pan", "lift", "elbow", "wristFlex"] as const) {
      expect(after[key]).toBeCloseTo(before[key], 6);
    }
    expect(after.gripper).toBeLessThan(before.gripper);
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
