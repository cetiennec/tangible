import { describe, expect, it } from "vitest";
import { linkFraction, projectSurface } from "./area-surface.js";
import { MAX_LINK_CM, MIN_LINK_CM, reachCoverage } from "./kinematics.js";

const box = { left: 0, right: 300, top: 0, bottom: 200 };

describe("the area surface projection", () => {
  it("maps the ends of the slider range onto the ends of the plot", () => {
    expect(linkFraction(MIN_LINK_CM)).toBeCloseTo(0, 12);
    expect(linkFraction(MAX_LINK_CM)).toBeCloseTo(1, 12);
  });

  it("draws a larger area higher up the screen", () => {
    const low = projectSurface(box, 0.5, 0.5, 0.1);
    const high = projectSurface(box, 0.5, 0.5, 0.9);
    expect(high.y).toBeLessThan(low.y); // canvas y grows downwards
  });

  it("separates the two link axes horizontally", () => {
    const alongL1 = projectSurface(box, 1, 0, 0);
    const alongL2 = projectSurface(box, 0, 1, 0);
    expect(alongL1.x).toBeGreaterThan(alongL2.x);
  });

  it("keeps the whole surface inside its box", () => {
    for (let i = 0; i <= 10; i += 1) {
      for (let j = 0; j <= 10; j += 1) {
        const p = projectSurface(box, i / 10, j / 10, 1);
        expect(p.x).toBeGreaterThanOrEqual(box.left);
        expect(p.x).toBeLessThanOrEqual(box.right);
        expect(p.y).toBeGreaterThanOrEqual(box.top);
        expect(p.y).toBeLessThanOrEqual(box.bottom);
      }
    }
  });
});

describe("what the surface is meant to show", () => {
  it("crests where the links are equal, for any first link", () => {
    for (const l1 of [5, 8, 12]) {
      let best = { l2: 0, value: -1 };
      for (let l2 = MIN_LINK_CM; l2 <= MAX_LINK_CM; l2 += 0.05) {
        const value = reachCoverage(l1, l2);
        if (value > best.value) best = { l2, value };
      }
      expect(best.l2).toBeCloseTo(l1, 1);
    }
  });

  it("is a fraction, so the surface has a natural ceiling", () => {
    for (const [l1, l2] of [[3, 12], [9, 7], [12, 12]]) {
      const value = reachCoverage(l1!, l2!);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
