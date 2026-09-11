// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { presentationScale, resizeScene } from "./scene-size.js";

const designSize = { width: 1280, height: 720 };
afterEach(() => vi.restoreAllMocks());

describe("scene sizing", () => {
  it("enlarges by the limiting dimension and retains small-screen minimum sizes", () => {
    expect(presentationScale(3840, 2160, designSize)).toBe(3);
    expect(presentationScale(3840, 720, designSize)).toBe(1);
    expect(presentationScale(1280, 2160, designSize)).toBe(1);
    expect(presentationScale(667, 375, designSize)).toBe(1);
    expect(presentationScale(3840, 2160)).toBe(1);
  });

  it("rejects invalid reference dimensions", () => {
    for (const value of [0, -1, NaN, Infinity]) {
      expect(() => presentationScale(1280, 720, { width: value, height: 720 })).toThrow("scene.designSize");
      expect(() => presentationScale(1280, 720, { width: 1280, height: value })).toThrow("scene.designSize");
    }
  });

  it("separates scene coordinates, CSS magnification, and display density", () => {
    const canvas = document.createElement("canvas"), container = document.createElement("div");
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ width: 2560, height: 1440 } as DOMRect);
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    expect(resizeScene(canvas, container, designSize)).toEqual({ width: 1280, height: 720, scale: 2, canvasScale: 4 });
    expect(canvas.width).toBe(5120);
    expect(canvas.height).toBe(2880);
    expect(container.style.zoom).toBe("2");

    // Switching to a scene without a reference restores ordinary CSS coordinates.
    expect(resizeScene(canvas, container)).toEqual({ width: 2560, height: 1440, scale: 1, canvasScale: 2 });
    expect(container.style.zoom).toBe("1");
  });
});
