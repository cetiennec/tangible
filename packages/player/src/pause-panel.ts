// PausePanel — what the learner sees while an authored checkpoint holds
// playback. Without it a silent pause simply stops, with no caption and no
// visible control, so the lesson looks stuck rather than deliberately paused.
//
// It sits in the caption band, which is empty for the duration of a pause, and
// it is a small bar rather than a covering screen: the whole point of a
// checkpoint is that the scene stays usable while it holds.

export interface PausePanelActions {
  onContinue: () => void;
}

export class PausePanel {
  readonly el: HTMLElement;
  private promptEl: HTMLParagraphElement;
  private shownPrompt: string | null = null;
  private visible = false;

  constructor(actions: PausePanelActions) {
    this.el = document.createElement("div");
    this.el.className = "xv-pause-panel";
    this.el.hidden = true;
    // Announced politely, so a learner who cannot see the bar is still told
    // that the lesson is waiting for them rather than broken.
    this.el.setAttribute("role", "status");
    this.el.setAttribute("aria-live", "polite");

    const text = document.createElement("div");
    text.className = "xv-pause-text";

    const title = document.createElement("p");
    title.className = "xv-pause-title";
    title.textContent = "Paused";

    this.promptEl = document.createElement("p");
    this.promptEl.className = "xv-pause-prompt";
    this.promptEl.hidden = true;

    text.append(title, this.promptEl);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "xv-pause-button";
    button.textContent = "Continue";
    button.onclick = () => actions.onContinue();

    this.el.append(text, button);
  }

  /** Show the bar while a checkpoint holds, with the author's prompt if any. */
  update(holding: boolean, prompt: string | null): void {
    if (holding !== this.visible) {
      this.visible = holding;
      this.el.hidden = !holding;
    }
    if (!holding) return;
    const text = prompt?.trim() ?? "";
    if (text === this.shownPrompt) return;
    this.shownPrompt = text;
    this.promptEl.textContent = text;
    this.promptEl.hidden = text === "";
  }
}
