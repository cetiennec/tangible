import { describe, expect, it } from "vitest";
import { linkFraction, projectSurface } from "./area-surface.js";
import { MAX_LINK_CM, MIN_LINK_CM, reachableArea } from "./kinematics.js";

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
  it("peaks at equal links once link 2 may not exceed link 1", () => {
    for (const l1 of [5, 8, 12]) {
      let best = { l2: 0, area: -1 };
      for (let l2 = MIN_LINK_CM; l2 <= l1 + 1e-9; l2 += 0.05) {
        const area = reachableArea(l1, l2);
        if (area > best.area) best = { l2, area };
      }
      expect(best.l2).toBeCloseTo(l1, 1);
    }
  });

  it("puts the highest point of the allowed half at the longest equal links", () => {
    expect(reachableArea(MAX_LINK_CM, MAX_LINK_CM)).toBeGreaterThan(reachableArea(MAX_LINK_CM, MIN_LINK_CM));
  });
});
