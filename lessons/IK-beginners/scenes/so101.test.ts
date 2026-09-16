// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { SceneContext } from "@tangible/player";
import { scene, schema } from "./so101.js";

function context(): SceneContext {
  const player = document.createElement("div");
  const overlay = document.createElement("div");
  const canvas = document.createElement("canvas");
  player.append(canvas, overlay);
  return {
    canvas,
    overlay,
    viewport: () => ({ width: 1280, height: 720 }),
    size: () => ({ width: 1280, height: 720, scale: 1, canvasScale: 1 }),
    write: vi.fn(),
    reset: vi.fn(),
    pause: vi.fn(),
  };
}

describe("the SO-101 episode scene", () => {
  it("embeds the visualiser pointed at the recorded episode", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const frame = ctx.overlay.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toContain("lerobot-visualize-dataset.hf.space");
    expect(decodeURIComponent(frame.getAttribute("src")!)).toContain("/cetiennec/so101_red_on_green_merged/episode_0");
    expect(frame.getAttribute("title")).toMatch(/SO-101/);
    instance.dispose();
  });

  it("offers a link in case the embedded viewer does not load", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const link = ctx.overlay.querySelector<HTMLAnchorElement>(".so101-fallback a")!;
    expect(link.getAttribute("href")).toContain("huggingface.co/spaces/lerobot/visualize_dataset");
    expect(link.getAttribute("rel")).toContain("noopener");
    instance.dispose();
  });

  it("shows a side note only for the teleoperation route being discussed", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    const note = ctx.overlay.querySelector<HTMLElement>(".so101-note")!;

    instance.render({ teleop: "none" }, { dt: 0, activity: {} });
    expect(note.hidden).toBe(true);

    instance.render({ teleop: "phone" }, { dt: 0, activity: {} });
    expect(note.hidden).toBe(false);
    expect(note.textContent).toMatch(/Cartesian/);
    expect(note.textContent).toMatch(/IK/);

    instance.render({ teleop: "leader" }, { dt: 0, activity: {} });
    expect(note.textContent).toMatch(/joint space/);
    instance.dispose();
  });

  it("cleans up the embed and the player class when it is left", () => {
    const ctx = context();
    const instance = scene.create(ctx);
    expect(ctx.canvas.getAttribute("aria-hidden")).toBe("true");
    instance.dispose();
    expect(ctx.overlay.children).toHaveLength(0);
    expect(ctx.overlay.parentElement!.classList.contains("so101-player")).toBe(false);
    expect(ctx.canvas.hasAttribute("aria-hidden")).toBe(false);
  });

  it("declares only the parameter the narration cues", () => {
    expect(Object.keys(schema)).toEqual(["teleop"]);
  });
});
