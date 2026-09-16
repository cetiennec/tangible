import { describe, expect, it } from "vitest";
import {
  directionOf,
  forwardKinematics,
  NORMALIZED_AREA,
  normalizedArea,
  reachableArea,
  reachableRadii,
  SQ_CM_PER_SQ_M,
  TAU,
  wrapAngle,
} from "./kinematics.js";

const HALF_PI = Math.PI / 2;

describe("two-link forward kinematics", () => {
  it("stretches along the x axis when both angles are zero", () => {
    const { elbow, tip } = forwardKinematics(0, 0, 9, 7);
    expect(elbow.x).toBeCloseTo(9, 12);
    expect(elbow.y).toBeCloseTo(0, 12);
    expect(tip.x).toBeCloseTo(16, 12);
    expect(tip.y).toBeCloseTo(0, 12);
  });

  it("measures q2 from link 1 rather than from the x axis", () => {
    // Link 1 points up, then the elbow turns a further quarter turn to point left.
    const { elbow, tip } = forwardKinematics(HALF_PI, HALF_PI, 9, 7);
    expect(elbow.x).toBeCloseTo(0, 12);
    expect(elbow.y).toBeCloseTo(9, 12);
    expect(tip.x).toBeCloseTo(-7, 12);
    expect(tip.y).toBeCloseTo(9, 12);
  });

  it("folds link 2 back over link 1 when q2 is PI", () => {
    const { tip } = forwardKinematics(0, Math.PI, 9, 7);
    expect(Math.hypot(tip.x, tip.y)).toBeCloseTo(2, 12);
  });

  it("keeps the tip distance governed by q2 alone, for any q1", () => {
    const [l1, l2] = [9, 7];
    for (const q1 of [0, 1.1, 3.0, 4.5, 6.1]) {
      for (const q2 of [0, 0.5, 2.4, 3.9, 5.7]) {
        const { tip } = forwardKinematics(q1, q2, l1, l2);
        const expected = Math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(q2));
        expect(Math.hypot(tip.x, tip.y)).toBeCloseTo(expected, 12);
      }
    }
  });

  it("places the tip inside the reachable annulus for every pose", () => {
    const [l1, l2] = [11, 4];
    const { inner, outer } = reachableRadii(l1, l2);
    for (let i = 0; i < 64; i += 1) {
      const q1 = (i / 64) * TAU;
      const q2 = TAU - (i / 64) * TAU;
      const radius = Math.hypot(...Object.values(forwardKinematics(q1, q2, l1, l2).tip));
      expect(radius).toBeGreaterThanOrEqual(inner - 1e-12);
      expect(radius).toBeLessThanOrEqual(outer + 1e-12);
    }
  });
});

describe("reachable radii", () => {
  it("spans from the folded arm to the straight arm", () => {
    expect(reachableRadii(9, 7)).toEqual({ inner: 2, outer: 16 });
  });

  it("closes the inner hole when the links are equal", () => {
    expect(reachableRadii(6, 6).inner).toBe(0);
  });
});

describe("reachable area", () => {
  it("equals four pi times the product of the link lengths", () => {
    for (const [l1, l2] of [[9, 7], [3, 12], [6, 6], [12, 12], [4.5, 10.25]]) {
      expect(reachableArea(l1!, l2!)).toBeCloseTo(4 * Math.PI * l1! * l2!, 9);
    }
  });

  it("is a full disc when the links are equal", () => {
    const radius = reachableRadii(6, 6).outer;
    expect(reachableArea(6, 6)).toBeCloseTo(Math.PI * radius * radius, 9);
  });

  it("depends on the product of the links, not on their total length", () => {
    // Same total length of 20 cm, but the balanced pair sweeps the larger area.
    expect(reachableArea(10, 10)).toBeGreaterThan(reachableArea(4, 16));
    expect(reachableArea(8, 12)).toBeCloseTo(reachableArea(12, 8), 9);
  });

  it("converts to square metres by ten thousand", () => {
    expect(reachableArea(10, 10) / SQ_CM_PER_SQ_M).toBeCloseTo(0.1257, 4);
  });
});

describe("normalized area", () => {
  it("is four pi for every pair of link lengths", () => {
    for (let l1 = 0.5; l1 <= 20; l1 += 0.37) {
      for (let l2 = 0.5; l2 <= 20; l2 += 0.53) {
        expect(normalizedArea(l1, l2)).toBeCloseTo(NORMALIZED_AREA, 9);
      }
    }
  });

  it("does not move when only one link changes", () => {
    expect(normalizedArea(3, 7)).toBeCloseTo(normalizedArea(12, 7), 9);
    expect(normalizedArea(7, 3)).toBeCloseTo(normalizedArea(7, 12), 9);
  });
});

describe("angle helpers", () => {
  it.each([
    [0, 0],
    [HALF_PI, HALF_PI],
    [Math.PI, Math.PI],
    [-Math.PI, Math.PI],
    [TAU, 0],
    [3 * HALF_PI, 3 * HALF_PI],
    [-HALF_PI, 3 * HALF_PI],
    [-3 * HALF_PI, HALF_PI],
    [-5 * Math.PI, Math.PI],
    [TAU + 0.25, 0.25],
  ])("wraps %f into [0, TAU) as %f", (angle, expected) => {
    expect(wrapAngle(angle)).toBeCloseTo(expected, 12);
  });

  it("recovers both joint angles from the drawn pose", () => {
    const [q1, q2, l1, l2] = [1.1, 4.2, 9, 7];
    const { base, elbow, tip } = forwardKinematics(q1, q2, l1, l2);
    expect(wrapAngle(directionOf(base, elbow))).toBeCloseTo(q1, 12);
    expect(wrapAngle(directionOf(elbow, tip) - q1)).toBeCloseTo(q2, 12);
  });
});
