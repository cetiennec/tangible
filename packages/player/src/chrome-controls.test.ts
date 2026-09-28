// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { LessonTracks } from "@tangible/core";
import { AudioClock, type MediaClockSource } from "./clock.js";
import { Chrome } from "./chrome.js";

class FakeMedia implements MediaClockSource {
  currentTime = 5;
  paused = true;
  duration = 20;
  play() { this.paused = false; }
  pause() { this.paused = true; }
  addEventListener() {}
}

let media: FakeMedia;
let chrome: Chrome;
let unbind: () => void;
beforeEach(() => {
  media = new FakeMedia();
  const tracks = { duration: 20, chapters: [], pauses: [] } as unknown as LessonTracks;
  chrome = new Chrome(new AudioClock(media), tracks);
  unbind = chrome.bindKeys(window);
});
afterEach(() => {
  unbind();
  document.body.replaceChildren();
});

/** Press a key with focus on a fresh element of the given kind. */
function pressOn(html: string, key: string): void {
  document.body.innerHTML = html;
  const target = document.body.firstElementChild as HTMLElement;
  target.focus();
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("Chrome keyboard shortcuts", () => {
  it("resumes with the space bar after the learner has moved a slider", () => {
    pressOn('<input type="range">', " ");
    expect(media.paused).toBe(false);
  });

  it("leaves a slider's arrow keys to the slider", () => {
    pressOn('<input type="range">', "ArrowRight");
    expect(media.currentTime).toBe(5);
  });

  it("still ignores keys typed into a text field or pressed on a button", () => {
    pressOn('<input type="text">', " ");
    pressOn("<button>Reset</button>", " ");
    expect(media.paused).toBe(true);
  });
});

describe("Chrome play button", () => {
  it("keeps its text node from frame to frame, so a held click is not dropped", () => {
    const button = chrome.el.querySelector(".xv-play")!;
    chrome.update(1);
    const text = button.firstChild;
    chrome.update(1.02);
    expect(button.firstChild).toBe(text);

    media.paused = false;
    chrome.update(1.04);
    expect(button.textContent).toBe("⏸");
    expect(button.getAttribute("aria-label")).toBe("Pause lesson");
  });
});
