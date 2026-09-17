import { describe, expect, it } from "vitest";
import { LINKS, redundantPose, shoulderRange, TARGET } from "./redundant.js";

describe("the redundant three-jointed arm", () => {
  it("keeps the tip on the target for every member of the family", () => {
    for (let i = 0; i <= 40; i += 1) {
      const { joints } = redundantPose(i / 40);
      const tip = joints[3]!;
      expect(tip.x).toBeCloseTo(TARGET.x, 9);
      expect(tip.y).toBeCloseTo(TARGET.y, 9);
    }
  });

  it("gives genuinely different arm shapes, not the same pose twice", () => {
    const first = redundantPose(0);
    const last = redundantPose(1);
    expect(Math.hypot(first.joints[1]!.x - last.joints[1]!.x, first.joints[1]!.y - last.joints[1]!.y)).toBeGreaterThan(3);
    expect(first.angles[0]).not.toBeCloseTo(last.angles[0]!, 2);
  });

  it("respects the three link lengths at every joint", () => {
    const { joints } = redundantPose(0.37);
    const lengths = [LINKS.l1, LINKS.l2, LINKS.l3];
    for (let i = 0; i < 3; i += 1) {
      const span = Math.hypot(joints[i + 1]!.x - joints[i]!.x, joints[i + 1]!.y - joints[i]!.y);
      expect(span).toBeCloseTo(lengths[i]!, 9);
    }
  });

  it("stops short of the shoulder angles where the arm would lock straight", () => {
    const { from, to } = shoulderRange();
    expect(to).toBeGreaterThan(from);
    // At both ends the last two links are still bent, not fully extended.
    for (const spread of [0, 1]) {
      const { joints } = redundantPose(spread);
      const elbowToTip = Math.hypot(joints[3]!.x - joints[1]!.x, joints[3]!.y - joints[1]!.y);
      expect(elbowToTip).toBeLessThan(LINKS.l2 + LINKS.l3 - 0.1);
    }
  });
});
