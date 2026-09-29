// ExportMedia — a media source the video exporter moves forward itself, one frame
// at a time, in place of the <audio> element. The player reads it exactly as it
// reads real playback, so pause checkpoints stop it and Continue resumes it.

import type { MediaClockSource } from "./clock.js";

type Listener = () => void;

export class ExportMedia implements MediaClockSource {
  currentTime = 0;
  paused = false;
  private listeners = new Map<string, Listener[]>();

  constructor(readonly duration: number) {}

  play(): void {
    this.paused = false;
    this.emit("play");
  }

  pause(): void {
    this.paused = true;
    this.emit("pause");
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  private emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

/** What the exporter learns after drawing one frame. */
export interface ExportFrame {
  t: number;
  paused: boolean;
  scene?: string;
}

/**
 * The exporter's controls, exposed on the page as window.__tangibleExport.
 * `step` plays forward to a lesson time unless a checkpoint has stopped the
 * clock, draws, and resolves once the frame has been painted.
 */
export function exportControls(media: ExportMedia, draw: () => void, scene: () => string | undefined) {
  const painted = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const report = (): ExportFrame => ({ t: media.currentTime, paused: media.paused, scene: scene() });
  return {
    async step(t: number): Promise<ExportFrame> {
      if (!media.paused) media.currentTime = Math.min(t, media.duration);
      draw();
      await painted();
      return report();
    },
    resume(): void {
      media.play();
    },
    state: report,
  };
}
