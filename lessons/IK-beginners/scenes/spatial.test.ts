import { describe, expect, it } from "vitest";
import { jacobian, norm, solveSpatial, spatialFk, TARGET } from "./spatial.js";

const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!] as [number, number, number];

describe("the five-jointed arm in three dimensions", () => {
  it("holds the tip on the target across the whole family", () => {
    for (let i = 0; i <= 40; i += 1) {
      const pose = solveSpatial(i / 40);
      expect(norm(sub(pose.tip, TARGET))).toBeLessThan(1e-6);
    }
  });

  it("gives genuinely different shapes, not the same pose repeated", () => {
    const first = solveSpatial(0);
    const last = solveSpatial(1);
    const moved = first.joints.map((joint, i) => norm(sub(joint, last.joints[i]!)));
    // Some interior joint has travelled a long way while the tip has not moved.
    expect(Math.max(...moved)).toBeGreaterThan(0.3);
    expect(moved[moved.length - 1]).toBeLessThan(1e-6);
  });

  it("is a genuinely spatial chain, not a flat one", () => {
    const spread = [0, 0.5, 1].map((s) => solveSpatial(s).joints.map((j) => j[2]!));
    const depths = spread.flat();
    expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.2);
  });

  it("keeps every link at its own fixed length", () => {
    const a = solveSpatial(0.2).joints;
    const b = solveSpatial(0.8).joints;
    for (let i = 0; i < a.length - 1; i += 1) {
      expect(norm(sub(a[i + 1]!, a[i]!))).toBeCloseTo(norm(sub(b[i + 1]!, b[i]!)), 9);
    }
  });

  it("reports how the tip responds to each joint", () => {
    const pose = spatialFk([0.3, -0.4, 0.8, 0.2, 0.5]);
    const rows = jacobian(pose);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveLength(5);
    // Nudging a joint should move the tip roughly as the Jacobian predicts.
    const nudge = 1e-5;
    const moved = spatialFk(pose.angles.map((v, i) => (i === 1 ? v + nudge : v)));
    for (const axis of [0, 1, 2]) {
      expect((moved.tip[axis]! - pose.tip[axis]!) / nudge).toBeCloseTo(rows[axis]![1]!, 4);
    }
  });
});
