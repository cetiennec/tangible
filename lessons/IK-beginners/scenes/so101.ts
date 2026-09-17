import type { OrbitState, PlainState, Schema } from "@tangible/core";
import { orbitHandle } from "@tangible/ingredients";
import type { SceneContext, SceneModule } from "@tangible/player";
import { INK, LINK1, MUTED, TIP } from "./controls.js";
import { RobotView } from "./so101-view.js";
import { GRASP_AT, RELEASE_AT, taskFrame, TASK_JOINTS } from "./task.js";

const SOURCE = "https://huggingface.co/spaces/lerobot/visualize_dataset";
// LeRobot's own mark, from the organisation that publishes the robot
// description this scene loads. Shown as attribution, beside the credit.
const LOGO = "https://cdn-avatars.huggingface.co/v1/production/uploads/631ce4b244503b72277fc89f/pcLUTLsvMQiR-ujlTgLYF.png";

/** Joint ranges as the published SO-101 description declares them. */
const JOINTS = [
  { param: "pan", joint: "shoulder_pan", label: "Shoulder pan", range: [-1.91986, 1.91986] },
  { param: "lift", joint: "shoulder_lift", label: "Shoulder lift", range: [-1.74533, 1.74533] },
  { param: "elbow", joint: "elbow_flex", label: "Elbow", range: [-1.69, 1.69] },
  { param: "wristFlex", joint: "wrist_flex", label: "Wrist flex", range: [-1.65806, 1.65806] },
  { param: "wristRoll", joint: "wrist_roll", label: "Wrist roll", range: [-2.74385, 2.84121] },
  { param: "gripper", joint: "gripper", label: "Gripper", range: [-0.17453, 1.74533] },
] as const;

const HOME: OrbitState = { target: [0, 0.12, 0], distance: 0.62, azimuth: 0.9, elevation: 0.42 };

export const schema: Schema = {
  ...Object.fromEntries(
    JOINTS.map((entry) => [
      entry.param,
      {
        type: { kind: "scalar", range: [...entry.range] },
        default: 0,
        interpolate: "lerp",
        ownership: "script",
        label: `${entry.label} angle, in radians`,
      },
    ]),
  ),
  camera: { type: { kind: "orbit" }, default: HOME, interpolate: "orbit", ownership: "viewer", label: "viewpoint on the arm" },
  task: {
    type: { kind: "scalar", range: [0, 1] },
    default: 0,
    interpolate: "lerp",
    ownership: "script",
    label: "progress through the pick-and-place the pair performs",
  },
  "show.task": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "let the pair run the task, with a brick on the table",
  },
  "show.leader": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "stand a second arm beside the first, driven by the same joint angles",
  },
  teleop: {
    type: { kind: "enum", values: ["none", "phone", "controller", "leader"] },
    default: "none",
    interpolate: "snap",
    ownership: "script",
    label: "which teleoperation route the side note explains",
  },
} as Schema;

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
        <div class="so101-brand">
          <img class="so101-logo" src="${LOGO}" alt="LeRobot" referrerpolicy="no-referrer" width="34" height="34">
          <p class="so101-kicker">The real robot</p>
        </div>
        <h1>An SO-101, six joints in three dimensions</h1>
      </header>
      <p class="so101-status">Loading the SO-101 model…</p>
      <div class="so101-names" hidden>
        <span class="so101-name so101-name-leader">leader</span>
        <span class="so101-name so101-name-follower">follower</span>
      </div>
      <figure class="so101-device" hidden></figure>
      <aside class="so101-note" hidden>
        <p class="so101-note-title"></p>
        <p class="so101-note-body"></p>
      </aside>
      <p class="so101-credit">Robot description published by
        <a href="${SOURCE}" target="_blank" rel="noreferrer noopener">LeRobot</a>. Drag to turn the view.</p>
    `;
    const style = document.createElement("style");
    style.textContent = STYLE;
    const player = ctx.overlay.parentElement!;
    player.classList.add("so101-player");
    ctx.canvas.setAttribute("role", "img");
    ctx.canvas.setAttribute("aria-label", "A three-dimensional view of an SO-101 robot arm with six joints.");
    ctx.overlay.append(style, root);

    const status = root.querySelector<HTMLElement>(".so101-status")!;
    const note = root.querySelector<HTMLElement>(".so101-note")!;
    const noteTitle = root.querySelector<HTMLElement>(".so101-note-title")!;
    const noteBody = root.querySelector<HTMLElement>(".so101-note-body")!;
    const names = root.querySelector<HTMLElement>(".so101-names")!;
    const device = root.querySelector<HTMLElement>(".so101-device")!;
    let shownDevice = "";

    const view = new RobotView(ctx.overlay);
    let ready = false;
    let failed = false;
    // Where the brick waits before the grasp, and where it is left afterwards.
    let pickAt: [number, number, number] | undefined;
    let placeAt: [number, number, number] | undefined;
    const jointsFor = (progress: number) => {
      const frame = taskFrame(progress);
      return TASK_JOINTS.map((param, i) => ({
        joint: JOINTS[i]!.joint,
        angle: frame[param],
      }));
    };
    view
      .load(2)
      .then(() => {
        ready = true;
        status.hidden = true;
        // Only the follower carries gripper jaws. The leader is held by a
        // person and ends in a handle, so its jaws are left off rather than
        // showing a second follower and calling it a leader.
        view.setLinkVisible(1, "moving_jaw_so101_v1_link", false);
        // Read the two table spots off the arm itself, so the brick always sits
        // exactly where the gripper closes and opens.
        pickAt = view.measureGrip(jointsFor(GRASP_AT));
        placeAt = view.measureGrip(jointsFor(RELEASE_AT));
      })
      .catch((error: unknown) => {
        failed = true;
        status.textContent = "The SO-101 model could not be loaded. Check the connection and reload.";
        status.classList.add("so101-failed");
        console.error("SO-101 model loading failed:", error);
      });

    const box = () => {
      const { width, height } = ctx.size();
      return { left: width * 0.03, top: height * 0.14, width: width * 0.62, height: height - height * 0.14 - 72 };
    };

    return {
      render(state: Readonly<PlainState>) {
        const size = ctx.size();
        view.place(box(), size);
        const pair = state["show.leader"] as boolean;
        if (ready) {
          // Both arms are driven by the same numbers: that is the whole point of
          // the sentence this scene illustrates.
          const running = state["show.task"] as boolean;
          const frame = running ? taskFrame(state.task as number) : undefined;
          for (const [index, entry] of JOINTS.entries()) {
            // During the task both arms follow the script; otherwise they follow
            // the narration's own joint cues. Either way they share the numbers.
            const angle = frame ? frame[TASK_JOINTS[index]!] : (state[entry.param] as number);
            for (let arm = 0; arm < view.armCount; arm += 1) view.setJoint(entry.joint, angle, arm);
          }
          // The leader is held by a person, so it carries a handle, not jaws.
          view.setHandle(1, pair, MUTED);
          if (!running) view.setBrick(undefined, TIP);
          else if (frame!.holding) view.setBrick(view.gripPoint(0), TIP);
          else view.setBrick((state.task as number) < GRASP_AT ? pickAt : placeAt, TIP);
          const camera = state.camera as OrbitState;
          view.arrange(pair, 0.46, camera.azimuth);
          view.setCamera(camera.azimuth, camera.elevation, camera.distance);
          view.render();
        } else if (!failed) {
          status.hidden = false;
        }
        names.hidden = !pair || !ready;

        const teleop = String(state.teleop);
        const drawing = DEVICES[teleop];
        device.hidden = !drawing;
        if (drawing && shownDevice !== teleop) {
          device.innerHTML = drawing;
          shownDevice = teleop;
        }

        const chosen = NOTES[teleop];
        note.hidden = !chosen;
        if (chosen) {
          noteTitle.textContent = chosen.title;
          noteBody.textContent = chosen.body;
          note.style.setProperty("--accent", chosen.accent);
        }
      },
      handles: () => [orbitHandle({ speed: 0.006, minElevation: -0.2, maxElevation: 1.3, zoomSpeed: 0.0008, minDistance: 0.35, maxDistance: 1.2 })],
      dispose() {
        view.dispose();
        root.remove();
        style.remove();
        player.classList.remove("so101-player");
      },
    };
  },
};

const STYLE = `
.so101-player { background: #eef1f2; color: ${INK}; }
.so101-scene { font-family: system-ui, sans-serif; }
.so101-scene header { position: absolute; top: 4%; left: 3%; width: 52%; }
.so101-brand { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
.so101-logo { display: block; width: 34px; height: 34px; border-radius: 7px; object-fit: contain; background: #fff; }
.so101-kicker { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${MUTED}; }
.so101-scene h1 { margin: 0; font-size: clamp(16px, 2.2vw, 26px); line-height: 1.15; font-weight: 600; }
.so101-status { position: absolute; left: 3%; top: 48%; width: 62%; margin: 0; text-align: center; font-size: 14px; color: ${MUTED}; }
.so101-status.so101-failed { color: ${TIP}; }
.so101-device { position: absolute; right: 3%; top: 54%; width: 13%; margin: 0; }
.so101-device svg { display: block; width: 100%; height: auto; }
.so101-device .dev-body { fill: #ffffff; stroke: ${INK}; stroke-width: 5; stroke-linejoin: round; }
.so101-device .dev-screen { fill: rgba(31, 111, 139, .16); stroke: none; }
.so101-device .dev-detail { fill: ${MUTED}; }
.so101-device .dev-mark { fill: none; stroke: ${TIP}; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
.so101-note { position: absolute; right: 3%; top: 32%; width: 28%; padding: 14px 16px; border-left: 4px solid var(--accent, ${LINK1}); border-radius: 0 8px 8px 0; background: rgba(255, 255, 255, .92); }
.so101-note-title { margin: 0 0 6px; font-size: 14px; font-weight: 700; color: var(--accent, ${LINK1}); }
.so101-note-body { margin: 0; font-size: 13px; line-height: 1.45; color: ${INK}; }
.so101-names { position: absolute; left: 3%; top: 76%; width: 62%; display: flex; justify-content: space-around; pointer-events: none; }
.so101-name { padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,.85); font-size: 12px; font-weight: 700; letter-spacing: .04em; }
.so101-name-leader { color: ${LINK1}; }
.so101-name-follower { color: ${TIP}; }
.so101-credit { position: absolute; left: 3%; bottom: 58px; margin: 0; font-size: 11px; color: ${MUTED}; }
.so101-credit a { color: ${MUTED}; }
.so101-player .xv-board { top: 4%; right: 3%; width: 32%; height: 46%; padding: 0; font-size: 16px; }
/* The closing names topics this lesson does not cover; they are shown as
   labelled blocks under a heading rather than passed over in speech. */
.so101-player .xv-board-inner { gap: 7px; }
.so101-player .xv-board-item[data-id="later"] { font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${MUTED}; }
.so101-player .xv-board-item[data-id="t1"],
.so101-player .xv-board-item[data-id="t2"],
.so101-player .xv-board-item[data-id="t3"],
.so101-player .xv-board-item[data-id="t4"],
.so101-player .xv-board-item[data-id="t5"] {
  padding: 11px 14px; border-left: 4px solid ${LINK1}; border-radius: 0 9px 9px 0;
  background: rgba(255, 255, 255, .92); font-size: 16px; font-weight: 600; line-height: 1.25; color: ${INK};
}
.so101-player .xv-captions { color: ${INK}; text-shadow: none; }
@media (max-height: 500px) and (orientation: landscape) {
  .so101-scene h1 { font-size: 15px; }
  .so101-note { top: 28%; padding: 9px 11px; }
  .so101-note-body { font-size: 11px; }
  .so101-credit { display: none; }
}
`;
