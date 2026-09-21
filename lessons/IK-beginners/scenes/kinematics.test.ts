import { describe, expect, it } from "vitest";
import {
  wavePoint,
  waveReachable,
  circlePoint,
  oneSolutionSamples,
  twoSolutionSamples,
  withinJointLimits,
  clampToReach,
  directionOf,
  elbowBranch,
  forwardKinematics,
  inverseKinematics,
  FREE_ELBOW,
  JOINT_LIMITS,
  limitedRadii,
  MAX_REACH_CM,
  reachableSamples,
  reachCoverage,
  reachableRadii,
  TAU,
  unreachableSamples,
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

describe("inverse kinematics", () => {
  const [l1, l2] = [9, 7];

  it("returns joint angles that put the tip back on the target", () => {
    for (const target of [{ x: 10, y: 4 }, { x: -6, y: 8 }, { x: 0, y: -12 }, { x: -3, y: -5 }]) {
      for (const branch of ["up", "down"] as const) {
        const { q1, q2 } = inverseKinematics(target, l1, l2, branch);
        const { tip } = forwardKinematics(q1, q2, l1, l2);
        expect(tip.x).toBeCloseTo(target.x, 9);
        expect(tip.y).toBeCloseTo(target.y, 9);
      }
    }
  });

  it("gives two genuinely different poses that reach the same point", () => {
    const target = { x: 10, y: 4 };
    const up = inverseKinematics(target, l1, l2, "up");
    const down = inverseKinematics(target, l1, l2, "down");
    expect(up.q2).not.toBeCloseTo(down.q2, 3);
    // The elbow sits on opposite sides, but both tips land on the target.
    expect(forwardKinematics(up.q1, up.q2, l1, l2).elbow.y).not.toBeCloseTo(
      forwardKinematics(down.q1, down.q2, l1, l2).elbow.y,
      3,
    );
  });

  it("reports the branch it produced", () => {
    expect(elbowBranch(inverseKinematics({ x: 10, y: 4 }, l1, l2, "up").q2)).toBe("up");
    expect(elbowBranch(inverseKinematics({ x: 10, y: 4 }, l1, l2, "down").q2)).toBe("down");
  });

  it("recovers the pose that produced a point, for either branch", () => {
    for (const q2 of [-2.4, -0.9, 0.9, 2.6]) {
      const { tip } = forwardKinematics(1.1, q2, l1, l2);
      const solved = inverseKinematics(tip, l1, l2, elbowBranch(q2));
      expect(solved.q1).toBeCloseTo(1.1, 9);
      expect(solved.q2).toBeCloseTo(q2, 9);
    }
  });

  it("pulls a target beyond the arm's reach onto the outer circle", () => {
    const { outer } = reachableRadii(l1, l2);
    const { q1, q2, reached } = inverseKinematics({ x: 100, y: 0 }, l1, l2, "up");
    expect(Math.hypot(reached.x, reached.y)).toBeCloseTo(outer, 9);
    // A fully stretched arm: the elbow does not bend at all.
    expect(q2).toBeCloseTo(0, 9);
    expect(q1).toBeCloseTo(0, 9);
  });

  it("pushes a target inside the dead zone onto the inner circle", () => {
    const { inner } = reachableRadii(l1, l2);
    const { reached } = inverseKinematics({ x: 0.4, y: 0.3 }, l1, l2, "up");
    expect(Math.hypot(reached.x, reached.y)).toBeCloseTo(inner, 9);
    // Direction is preserved while the distance is corrected.
    expect(Math.atan2(reached.y, reached.x)).toBeCloseTo(Math.atan2(0.3, 0.4), 9);
  });

  it("handles a target exactly at the base without dividing by zero", () => {
    const { q1, q2 } = inverseKinematics({ x: 0, y: 0 }, l1, l2, "up");
    expect(Number.isFinite(q1)).toBe(true);
    expect(Number.isFinite(q2)).toBe(true);
  });
});

describe("clamping to the reachable annulus", () => {
  it("leaves a point that is already reachable alone", () => {
    const target = { x: 10, y: 4 };
    expect(clampToReach(target, 9, 7)).toEqual(target);
  });

  it("keeps every clamped point inside the annulus", () => {
    const { inner, outer } = reachableRadii(9, 7);
    for (const target of [{ x: 40, y: 40 }, { x: 0.1, y: 0 }, { x: -50, y: 3 }, { x: 0, y: 0 }]) {
      const radius = Math.hypot(...Object.values(clampToReach(target, 9, 7)));
      expect(radius).toBeGreaterThanOrEqual(inner - 1e-12);
      expect(radius).toBeLessThanOrEqual(outer + 1e-12);
    }
  });
});

describe("sample points the tip cannot reach", () => {
  it("places every sample outside the reachable annulus", () => {
    for (const [l1, l2] of [[9, 7], [12, 3], [5, 11]]) {
      const { inner, outer } = reachableRadii(l1!, l2!);
      for (const point of unreachableSamples(l1!, l2!)) {
        const radius = Math.hypot(point.x, point.y);
        expect(radius < inner || radius > outer).toBe(true);
      }
    }
  });

  it("offers points that are too far out and points that are too far in", () => {
    const { inner, outer } = unreachableSamples(9, 7).reduce(
      (acc, p) => {
        const r = Math.hypot(p.x, p.y);
        return { inner: acc.inner || r < 2, outer: acc.outer || r > 16 };
      },
      { inner: false, outer: false },
    );
    expect(outer).toBe(true);
    expect(inner).toBe(true);
  });

  it("drops the inner samples when equal links leave no dead zone", () => {
    // With l1 === l2 the annulus closes to a full disc, so nothing is too close.
    for (const point of unreachableSamples(8, 8)) {
      expect(Math.hypot(point.x, point.y)).toBeGreaterThan(16);
    }
  });

  it("keeps every sample inside the drawn area", () => {
    for (const point of unreachableSamples(12, 12)) {
      expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(MAX_REACH_CM * 1.25);
    }
  });
});

describe("reach coverage under joint limits", () => {
  it("is highest when the links are equal, for symmetric and lopsided limits alike", () => {
    const ranges: [number, number][] = [[-Math.PI, Math.PI], [-2.3, 2.3], [-2.6, 1.15], [-2.9, 0.4]];
    for (const range of ranges) {
      let best = { l2: 0, value: -1 };
      for (let l2 = 3; l2 <= 12; l2 += 0.25) {
        const value = reachCoverage(9, l2, range);
        if (value > best.value) best = { l2, value };
      }
      expect(best.l2).toBeCloseTo(9, 1);
    }
  });

  it("closes the dead zone completely only when the elbow can fold flat", () => {
    expect(reachCoverage(9, 9, FREE_ELBOW)).toBeCloseTo(1, 9);
    expect(reachCoverage(9, 9, JOINT_LIMITS.q2)).toBeLessThan(1);
    expect(limitedRadii(9, 9, FREE_ELBOW).inner).toBeCloseTo(0, 9);
    expect(limitedRadii(9, 9, JOINT_LIMITS.q2).inner).toBeGreaterThan(1);
  });

  it("agrees with the unlimited radii when the elbow is free", () => {
    const limited = limitedRadii(9, 7, FREE_ELBOW);
    const free = reachableRadii(9, 7);
    expect(limited.inner).toBeCloseTo(free.inner, 9);
    expect(limited.outer).toBeCloseTo(free.outer, 9);
  });

  it("reads the furthest reach from whichever end of the range is straightest", () => {
    // This elbow can never straighten, so the arm never reaches l1 + l2.
    const bent = limitedRadii(9, 7, [0.6, 2.4]);
    expect(bent.outer).toBeLessThan(16);
    expect(bent.outer).toBeCloseTo(Math.sqrt(81 + 49 + 2 * 63 * Math.cos(0.6)), 9);
  });

  it("uses the lopsided limits the lesson actually applies", () => {
    expect(JOINT_LIMITS.q2[0]).not.toBeCloseTo(-JOINT_LIMITS.q2[1], 3);
    expect(JOINT_LIMITS.q1[0]).not.toBeCloseTo(-JOINT_LIMITS.q1[1], 3);
  });
});

describe("naming the two elbow solutions", () => {
  /** Positive means the elbow lies above the line from shoulder to hand. */
  function elbowSide(q1: number, q2: number, l1 = 10, l2 = 10) {
    const { elbow, tip } = forwardKinematics(q1, q2, l1, l2);
    return tip.x * elbow.y - tip.y * elbow.x;
  }

  it.each([
    [0, 1],
    [0.5, 1],
    [2, 0.8],
    [4, 2.2],
  ])("calls it elbow-down when the elbow hangs below the line, at q1=%f q2=%f", (q1, q2) => {
    expect(elbowSide(q1!, q2!)).toBeLessThan(0);
    expect(elbowBranch(q2!)).toBe("down");
  });

  it.each([
    [0, -1],
    [0.5, -1],
    [2, -0.8],
    [4, -2.2],
  ])("calls it elbow-up when the elbow rides above the line, at q1=%f q2=%f", (q1, q2) => {
    expect(elbowSide(q1!, q2!)).toBeGreaterThan(0);
    expect(elbowBranch(q2!)).toBe("up");
  });

  it("solves for the branch it was asked for, and puts the elbow there", () => {
    const target = { x: 9, y: 5 };
    const up = inverseKinematics(target, 9, 7, "up");
    const down = inverseKinematics(target, 9, 7, "down");
    expect(elbowBranch(up.q2)).toBe("up");
    expect(elbowBranch(down.q2)).toBe("down");
    expect(elbowSide(up.q1, up.q2, 9, 7)).toBeGreaterThan(0);
    expect(elbowSide(down.q1, down.q2, 9, 7)).toBeLessThan(0);
  });
});

describe("sample points the tip can reach", () => {
  it("places every sample strictly inside the reachable annulus", () => {
    for (const [l1, l2] of [[9, 7], [12, 3], [5, 11], [8, 8]]) {
      const { inner, outer } = reachableRadii(l1!, l2!);
      for (const point of reachableSamples(l1!, l2!)) {
        const radius = Math.hypot(point.x, point.y);
        expect(radius).toBeGreaterThan(inner);
        expect(radius).toBeLessThan(outer);
      }
    }
  });

  it("never coincides with a point marked unreachable", () => {
    const reachable = reachableSamples(9, 7);
    for (const miss of unreachableSamples(9, 7)) {
      for (const hit of reachable) {
        expect(Math.hypot(hit.x - miss.x, hit.y - miss.y)).toBeGreaterThan(1);
      }
    }
  });

  it("spreads them around the ring rather than bunching them", () => {
    const angles = reachableSamples(9, 7).map((p) => Math.atan2(p.y, p.x));
    for (let i = 0; i < angles.length; i += 1) {
      for (let j = i + 1; j < angles.length; j += 1) {
        expect(Math.abs(angles[i]! - angles[j]!)).toBeGreaterThan(0.5);
      }
    }
  });
});


describe("sample points against the region actually on screen", () => {
  it("sits inside the free ring, which is what is drawn without joint limits", () => {
    // The lesson shows these with the joints free, where the reachable space is
    // a ring and every point in it genuinely has two solutions.
    const { inner, outer } = reachableRadii(12, 12);
    for (const point of reachableSamples(12, 12)) {
      const radius = Math.hypot(point.x, point.y);
      expect(radius).toBeGreaterThan(inner);
      expect(radius).toBeLessThan(outer);
    }
  });

  it("would fall outside the limited region, which is why limits are off there", () => {
    // Guards the ordering: with lopsided limits the shoulder sweeps only part of
    // the plane, so some samples are unreachable and the two-solution claim fails.
    const [low, high] = JOINT_LIMITS.q1;
    const outside = reachableSamples(12, 12).filter((point) => {
      const angle = Math.atan2(point.y, point.x);
      const turned = angle < 0 ? angle + Math.PI * 2 : angle;
      return turned < low || turned > high;
    });
    expect(outside.length).toBeGreaterThan(0);
  });
});

describe("twoSolutionSamples", () => {
  const shapes = [
    [12, 12],
    [14, 10],
    [10, 14],
    [8, 16],
  ] as const;

  it("only offers points the arm can reach both ways inside its limits", () => {
    for (const [l1, l2] of shapes) {
      const points = twoSolutionSamples(l1, l2);
      expect(points.length).toBeGreaterThan(0);
      for (const point of points) {
        for (const branch of ["up", "down"] as const) {
          const solved = inverseKinematics(point, l1, l2, branch);
          expect(withinJointLimits(solved.q1, solved.q2)).toBe(true);
          // A clamped solve would stand somewhere other than the drawn dot.
          expect(Math.hypot(solved.reached.x - point.x, solved.reached.y - point.y)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it("is stricter than the unlimited ring, which is the whole point", () => {
    // reachableSamples marks points that have two solutions when the joints
    // may turn freely. Under the real limits most of them no longer do, so the
    // two samplers must not be interchangeable.
    const [l1, l2] = [12, 12];
    const loose = reachableSamples(l1, l2).filter((point) =>
      (["up", "down"] as const).every((branch) => {
        const solved = inverseKinematics(point, l1, l2, branch);
        return withinJointLimits(solved.q1, solved.q2);
      }),
    );
    expect(loose.length).toBeLessThan(reachableSamples(l1, l2).length);
  });
});

describe("oneSolutionSamples", () => {
  const shapes = [
    [12, 12],
    [14, 10],
    [10, 14],
    [8, 16],
  ] as const;

  it("only offers points reachable exactly one of the two ways", () => {
    for (const [l1, l2] of shapes) {
      const points = oneSolutionSamples(l1, l2);
      expect(points.length).toBeGreaterThan(0);
      for (const point of points) {
        const valid = (["up", "down"] as const).filter((branch) => {
          const solved = inverseKinematics(point, l1, l2, branch);
          const reaches = Math.hypot(solved.reached.x - point.x, solved.reached.y - point.y) < 1e-6;
          return reaches && withinJointLimits(solved.q1, solved.q2);
        });
        expect(valid).toHaveLength(1);
      }
    }
  });

  it("spreads the picks around the ring rather than bunching them up", () => {
    // The valid region for "exactly one solution" is large enough to wrap
    // past 0/TAU; picking evenly by array index used to put the first and
    // last picks right next to each other there instead of spread out.
    for (const [l1, l2] of shapes) {
      const points = oneSolutionSamples(l1, l2);
      const angles = points.map((p) => Math.atan2(p.y, p.x));
      for (let i = 0; i < angles.length; i++) {
        for (let j = i + 1; j < angles.length; j++) {
          const diff = Math.abs(angles[i]! - angles[j]!) % (2 * Math.PI);
          const angular = Math.min(diff, 2 * Math.PI - diff);
          expect(angular).toBeGreaterThan((20 * Math.PI) / 180); // at least 20 degrees apart
        }
      }
    }
  });

  it("never overlaps with the two-solution samples for the same shape", () => {
    // The two dot groups are drawn together, in different colours; a point
    // in both would be a contradiction on screen.
    for (const [l1, l2] of shapes) {
      const ones = oneSolutionSamples(l1, l2);
      const twos = twoSolutionSamples(l1, l2);
      for (const one of ones) {
        for (const two of twos) {
          expect(Math.hypot(one.x - two.x, one.y - two.y)).toBeGreaterThan(1e-6);
        }
      }
    }
  });
});

describe("the baked circle", () => {
  it("stays inside JOINT_LIMITS along the whole lap, at the equal-link shape it is actually driven through", () => {
    // The narration claims every point on this path is a pose the motors can
    // hold, not just the start and end. That is only true because the radius
    // was chosen to fit; a naive size (a quarter of the annulus) dips outside
    // JOINT_LIMITS.q2 by a couple of degrees, which this pins against.
    const [l1, l2] = [12, 12];
    for (let step = 0; step < 360; step++) {
      const point = circlePoint(l1, l2, step / 360);
      const solved = inverseKinematics(point, l1, l2, "up");
      expect(withinJointLimits(solved.q1, solved.q2)).toBe(true);
    }
  });
});

describe("the baked wave", () => {
  it("can be followed exactly as far as waveReachable says, at the equal-link shape it is driven through", () => {
    const [l1, l2] = [12, 12];
    const reach = waveReachable(l1, l2);
    // Well short of the end, so the arm has a real path to trace, and well
    // short of the start, so the part it cannot reach is plainly visible.
    expect(reach).toBeGreaterThan(0.6);
    expect(reach).toBeLessThan(0.95);
    for (let step = 0; step <= 96; step++) {
      const point = wavePoint((step / 96) * reach);
      const solved = inverseKinematics(point, l1, l2, "up");
      expect(withinJointLimits(solved.q1, solved.q2)).toBe(true);
      expect(Math.hypot(solved.reached.x - point.x, solved.reached.y - point.y)).toBeLessThan(1e-6);
    }
  });

  it("runs out of the workspace after that, and never comes back into it", () => {
    const [l1, l2] = [12, 12];
    const reach = waveReachable(l1, l2);
    const { outer } = reachableRadii(l1, l2);
    // Every point past the cut is genuinely out of reach, so the unreachable
    // tail the narration points at is one continuous piece rather than the
    // path dipping in and out of the workspace.
    for (let step = 1; step <= 40; step++) {
      const point = wavePoint(reach + ((1 - reach) * step) / 40);
      expect(Math.hypot(point.x, point.y)).toBeGreaterThan(outer);
    }
  });

  it("is a genuinely different shape from the circle, not a relabelled copy", () => {
    // Curvature sign changes partway along a wave and never does around a
    // circle, so comparing consecutive turn directions tells them apart.
    const turns = Array.from({ length: 20 }, (_unused, i) => {
      const a = wavePoint(i / 20);
      const b = wavePoint((i + 1) / 20);
      return Math.atan2(b.y - a.y, b.x - a.x);
    });
    const signs = new Set(
      turns.slice(1).map((angle, i) => Math.sign(angle - turns[i]!)),
    );
    expect(signs.has(1)).toBe(true);
    expect(signs.has(-1)).toBe(true);
  });
});
