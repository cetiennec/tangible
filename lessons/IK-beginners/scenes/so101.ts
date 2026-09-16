import type { PlainState, Schema } from "@tangible/core";
import type { SceneContext, SceneModule } from "@tangible/player";
import { INK, LINK1, LINK2, MUTED, TIP } from "./controls.js";

// The LeRobot dataset visualiser, showing a recorded SO-101 episode. Hugging
// Face serves Spaces from a dedicated embed host and sets no framing
// restrictions, so this loads inside the lesson.
const EPISODE = "/cetiennec/so101_red_on_green_merged/episode_0";
const VIEWER = `https://lerobot-visualize-dataset.hf.space/?path=${encodeURIComponent(EPISODE)}`;
const SOURCE = `https://huggingface.co/spaces/lerobot/visualize_dataset?path=${encodeURIComponent(EPISODE)}`;

export const schema: Schema = {
  teleop: {
    type: { kind: "enum", values: ["none", "phone", "leader"] },
    default: "none",
    interpolate: "snap",
    ownership: "script",
    label: "which teleoperation route the side note explains",
  },
};

const NOTES: Record<string, { title: string; body: string; accent: string }> = {
  phone: {
    title: "Phone as teleoperator",
    body: "The operator moves a pose in Cartesian space, so the arm must solve IK to find its joint angles.",
    accent: TIP,
  },
  leader: {
    title: "Leader arm as teleoperator",
    body: "The leader's joint angles are copied straight to the follower. Planning happens in joint space, so no IK is needed.",
    accent: LINK1,
  },
};

export const scene: SceneModule = {
  schema,
  designSize: { width: 1280, height: 720 },
  create(ctx: SceneContext) {
    const root = document.createElement("section");
    root.className = "so101-scene";
    root.innerHTML = `
      <header>
        <p class="so101-kicker">Recorded episode</p>
        <h1>An SO-101 doing the task</h1>
      </header>
      <div class="so101-frame">
        <p class="so101-fallback">
          If this stays blank, the recording is at
          <a href="${SOURCE}" target="_blank" rel="noreferrer noopener">the LeRobot dataset visualiser</a>.
        </p>
        <iframe src="${VIEWER}" title="LeRobot dataset visualiser showing a recorded SO-101 episode"
          referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>
      <aside class="so101-note" hidden>
        <p class="so101-note-title"></p>
        <p class="so101-note-body"></p>
      </aside>
    `;
    const style = document.createElement("style");
    style.textContent = STYLE;
    const player = ctx.overlay.parentElement!;
    player.classList.add("so101-player");
    // Nothing is drawn on the canvas in this scene.
    ctx.canvas.setAttribute("aria-hidden", "true");
    ctx.overlay.append(style, root);

    const note = root.querySelector<HTMLElement>(".so101-note")!;
    const noteTitle = root.querySelector<HTMLElement>(".so101-note-title")!;
    const noteBody = root.querySelector<HTMLElement>(".so101-note-body")!;

    return {
      render(state: Readonly<PlainState>) {
        const chosen = NOTES[String(state.teleop)];
        note.hidden = !chosen;
        if (!chosen) return;
        noteTitle.textContent = chosen.title;
        noteBody.textContent = chosen.body;
        note.style.setProperty("--accent", chosen.accent);
      },
      handles: () => [],
      dispose() {
        root.remove();
        style.remove();
        player.classList.remove("so101-player");
        ctx.canvas.removeAttribute("aria-hidden");
      },
    };
  },
};

const STYLE = `
.so101-player { background: #f4f6f4; color: ${INK}; }
.so101-scene { font-family: system-ui, sans-serif; }
.so101-scene header { position: absolute; top: 4%; left: 3%; width: 50%; }
.so101-kicker { margin: 0 0 5px; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${MUTED}; }
.so101-scene h1 { margin: 0; font-size: clamp(16px, 2.2vw, 26px); line-height: 1.15; font-weight: 600; }
.so101-frame { position: absolute; left: 3%; top: 15%; width: 62%; bottom: 66px; border: 1px solid #c3cdd1; border-radius: 10px; overflow: hidden; background: #fff; pointer-events: auto; }
.so101-frame iframe { position: relative; width: 100%; height: 100%; border: 0; }
.so101-fallback { position: absolute; inset: 0; margin: 0; display: grid; place-items: center; padding: 20px; text-align: center; font-size: 13px; line-height: 1.5; color: ${MUTED}; }
.so101-fallback a { color: ${LINK2}; }
.so101-note { position: absolute; right: 3%; top: 30%; width: 28%; padding: 14px 16px; border-left: 4px solid var(--accent, ${LINK1}); border-radius: 0 8px 8px 0; background: rgba(255, 255, 255, .92); }
.so101-note-title { margin: 0 0 6px; font-size: 14px; font-weight: 700; color: var(--accent, ${LINK1}); }
.so101-note-body { margin: 0; font-size: 13px; line-height: 1.45; color: ${INK}; }
.so101-player .xv-board { top: 4%; right: 3%; width: 30%; height: 20%; padding: 0; font-size: 15px; }
.so101-player .xv-captions { color: ${INK}; text-shadow: none; }
@media (max-height: 500px) and (orientation: landscape) {
  .so101-scene h1 { font-size: 15px; }
  .so101-frame { top: 20%; width: 58%; }
  .so101-note { top: 26%; padding: 9px 11px; }
  .so101-note-body { font-size: 11px; }
}
`;
