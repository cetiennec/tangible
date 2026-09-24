// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { PausePanel } from "./pause-panel.js";

function make() {
  const onContinue = vi.fn();
  const panel = new PausePanel({ onContinue });
  return { panel, onContinue };
}

const text = (panel: PausePanel, selector: string) =>
  panel.el.querySelector<HTMLElement>(selector)?.textContent ?? "";

describe("PausePanel", () => {
  it("stays out of the way until a checkpoint holds playback", () => {
    const { panel } = make();
    expect(panel.el.hidden).toBe(true);
    panel.update(false, "Try the slider.");
    expect(panel.el.hidden).toBe(true);
  });

  it("says the lesson is paused, and why, once a checkpoint holds", () => {
    const { panel } = make();
    panel.update(true, "Try the slider.");
    expect(panel.el.hidden).toBe(false);
    expect(text(panel, ".xv-pause-title")).toBe("Paused");
    expect(text(panel, ".xv-pause-prompt")).toBe("Try the slider.");
  });

  it("still says the lesson is paused when the author wrote no prompt", () => {
    // A pause with nothing to say must not look like a lesson that froze.
    const { panel } = make();
    panel.update(true, null);
    expect(panel.el.hidden).toBe(false);
    expect(text(panel, ".xv-pause-title")).toBe("Paused");
    expect(panel.el.querySelector<HTMLElement>(".xv-pause-prompt")!.hidden).toBe(true);
  });

  it("hides again when playback resumes", () => {
    const { panel } = make();
    panel.update(true, "Try the slider.");
    panel.update(false, null);
    expect(panel.el.hidden).toBe(true);
  });

  it("offers a control that resumes, so the transport bar is not the only way", () => {
    const { panel, onContinue } = make();
    panel.update(true, "Try the slider.");
    panel.el.querySelector<HTMLButtonElement>(".xv-pause-button")!.click();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("announces itself politely, for a learner who cannot see it", () => {
    const { panel } = make();
    expect(panel.el.getAttribute("role")).toBe("status");
    expect(panel.el.getAttribute("aria-live")).toBe("polite");
  });

  it("swaps the prompt when a later checkpoint asks something else", () => {
    const { panel } = make();
    panel.update(true, "First question.");
    panel.update(false, null);
    panel.update(true, "Second question.");
    expect(text(panel, ".xv-pause-prompt")).toBe("Second question.");
  });
});
