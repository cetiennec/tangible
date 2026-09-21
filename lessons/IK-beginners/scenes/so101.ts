import type { OrbitState, PlainState, Schema } from "@tangible/core";
import { orbitHandle } from "@tangible/ingredients";
import type { SceneContext, SceneModule } from "@tangible/player";
import { INK, LINK1, LINK2, MUTED, TIP } from "./controls.js";
import { RobotView, warmRobotAssets } from "./so101-view.js";
import { LEROBOT_WORKFLOW_BOTTOM, LEROBOT_WORKFLOW_TOP } from "./lerobot-diagram.js";
import { GRASP_AT, RELEASE_AT, taskFrame, TASK_JOINTS } from "./task.js";

// The arms are a large download and this scene appears late, so start fetching
// as soon as the lesson bundle loads rather than when the scene opens.
void warmRobotAssets().catch(() => undefined);

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

const HOME: OrbitState = { target: [0, 0.12, 0], distance: 0.78, azimuth: 0.9, elevation: 0.42 };

// The strip chart's Y axis: the elbow's own mechanical travel, not just the
// range this one task happens to use, so the trace reads against what the
// joint could do rather than always filling the height regardless of task.
const ELBOW_RANGE = JOINTS.find((j) => j.param === "elbow")!.range;
/** Elbow angle across the task, sampled once — a fixed curve to trace live. */
const ELBOW_SAMPLES = Array.from({ length: 101 }, (_unused, i) => {
  const t = i / 100;
  return { t, v: taskFrame(t).elbow };
});

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
  "show.angles": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "draw the bend at two joints, the angles teleoperation copies",
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
  diagram: {
    type: { kind: "enum", values: ["none", "workflow1", "workflow2"] },
    default: "none",
    interpolate: "snap",
    ownership: "script",
    label: "show a panel of LeRobot's own workflow diagram",
  },
  "show.brand": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "grow the LeRobot mark for the introduction beat",
  },
} as Schema;

/** Simple drawings of the things a person teleoperates with. */
const DEVICES: Record<string, string> = {
  phone: `<svg viewBox="0 0 120 190" role="img" aria-label="A phone held as a teleoperator.">
      <rect x="22" y="8" width="76" height="174" rx="13" class="dev-body"></rect>
      <rect x="30" y="24" width="60" height="134" rx="5" class="dev-screen"></rect>
      <circle cx="60" cy="170" r="6" class="dev-detail"></circle>
      <path d="M60 91 L60 63 M53 71 L60 63 L67 71" class="dev-mark"></path>
      <path d="M60 91 L60 119 M53 111 L60 119 L67 111" class="dev-mark"></path>
      <path d="M60 91 L37 91 M45 84 L37 91 L45 98" class="dev-mark"></path>
      <path d="M60 91 L83 91 M75 84 L83 91 L75 98" class="dev-mark"></path>
    </svg>`,
  controller: `<svg viewBox="0 0 190 130" role="img" aria-label="A hand controller held as a teleoperator.">
      <path d="M38 30 h114 a34 34 0 0 1 0 68 h-16 l-14 -18 h-54 l-14 18 h-16 a34 34 0 0 1 0 -68 z" class="dev-body"></path>
      <circle cx="62" cy="58" r="12" class="dev-screen"></circle>
      <circle cx="62" cy="58" r="5" class="dev-detail"></circle>
      <circle cx="128" cy="58" r="12" class="dev-screen"></circle>
      <circle cx="128" cy="58" r="5" class="dev-detail"></circle>
      <path d="M86 78 h18 M95 69 v18" class="dev-mark"></path>
    </svg>`,
};

/** Add the arm's current on-screen offset to a point measured before it existed. */
export function offsetBrick(
  at: [number, number, number] | undefined,
  offset: [number, number, number],
): [number, number, number] | undefined {
  if (!at) return at;
  return [at[0] + offset[0], at[1] + offset[1], at[2] + offset[2]];
}

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
        <p class="so101-brand-label">LeRobot</p>
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
      <figure class="so101-diagram" hidden><img class="so101-diagram-img" alt=""></figure>
      <figure class="so101-camfeed" hidden>
        <figcaption>Camera feed — recorded alongside the joint angles</figcaption>
      </figure>
      <figure class="so101-graph" hidden>
        <svg viewBox="0 0 200 90" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="45" x2="200" y2="45" class="so101-graph-zero"></line>
          <polyline class="so101-graph-trace" points=""></polyline>
          <circle class="so101-graph-dot" r="3"></circle>
        </svg>
        <figcaption>Elbow angle — recorded over time</figcaption>
      </figure>
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
    const leaderName = root.querySelector<HTMLElement>(".so101-name-leader")!;
    const device = root.querySelector<HTMLElement>(".so101-device")!;
    const diagram = root.querySelector<HTMLElement>(".so101-diagram")!;
    const diagramImg = root.querySelector<HTMLImageElement>(".so101-diagram-img")!;
    let shownDiagram = "";
    const camFeed = root.querySelector<HTMLElement>(".so101-camfeed")!;
    const graph = root.querySelector<HTMLElement>(".so101-graph")!;
    const graphTrace = root.querySelector<SVGPolylineElement>(".so101-graph-trace")!;
    const graphDot = root.querySelector<SVGCircleElement>(".so101-graph-dot")!;
    let shownDevice = "";

    const view = new RobotView(ctx.overlay);
    let ready = false;
    let failed = false;
    // Where the brick waits before the grasp, and where it is left afterwards.
    let pickAt: [number, number, number] | undefined;
    let placeAt: [number, number, number] | undefined;
    // A fixed "external" camera watching the pick-and-place area, in the same
    // pre-arrange local frame as pickAt/placeAt above.
    let sceneCamLocal: { position: [number, number, number]; lookAt: [number, number, number] } | undefined;
    const jointsFor = (progress: number) => {
      const frame = taskFrame(progress);
      return TASK_JOINTS.map((param, i) => ({
        joint: JOINTS[i]!.joint,
        angle: frame[param],
      }));
    };
    view
      .load()
      .then(() => {
        ready = true;
        status.hidden = true;
        // Only the follower carries gripper jaws. The leader is held by a
        // person and ends in a handle, so its jaws are left off rather than
        // showing a second follower and calling it a leader.
        // Read the two table spots off the arm itself, so the brick always sits
        // exactly where the gripper closes and opens.
        pickAt = view.measureGrip(jointsFor(GRASP_AT));
        placeAt = view.measureGrip(jointsFor(RELEASE_AT));
        if (pickAt && placeAt) {
          const mid: [number, number, number] = [
            (pickAt[0] + placeAt[0]) / 2,
            (pickAt[1] + placeAt[1]) / 2,
            (pickAt[2] + placeAt[2]) / 2,
          ];
          // Mounted to one side of the workspace at roughly table height,
          // looking across at the midpoint — a fixed external view, not one
          // that tracks the gripper, the way a real recording camera bolted
          // beside the workspace would be.
          sceneCamLocal = { position: [mid[0] + 0.3, mid[1] + 0.05, mid[2] + 0.04], lookAt: mid };
        }
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
        const introBeat = Boolean(state["show.brand"]);
        root.classList.toggle("so101-brand-intro", introBeat);
        // The model may still be loading behind this beat, or may already be
        // sitting there ready — either way it has no business being seen
        // until the LeRobot introduction itself is done with the screen.
        view.setVisible(!introBeat);
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
          view.showJointAngles(0, state["show.angles"] as boolean, TIP);
          // Arrange before the brick, not after: pickAt and placeAt were
          // measured before arrange had ever run once, in the follower's own
          // frame, so they need the offset arrange just gave it added back in
          // — the same offset gripPoint's live reading already carries.
          const camera = state.camera as OrbitState;
          view.arrange(pair, 0.46, camera.azimuth);
          if (!running) view.setBrick(undefined, TIP);
          else if (frame!.holding) view.setBrick(view.gripPoint(0), TIP);
          else view.setBrick(offsetBrick((state.task as number) < GRASP_AT ? pickAt : placeAt, view.armOffset(0)), TIP);
          view.setCamera(camera.azimuth, camera.elevation, camera.distance);

          const showFeed = running && Boolean(sceneCamLocal);
          camFeed.hidden = !showFeed;
          const b = box();
          const margin = 14;
          const pipWidth = b.width * 0.3;
          const pipHeight = pipWidth * 0.72;
          const pipX = b.width - pipWidth - margin;
          const pipY = b.height - pipHeight - margin;
          if (showFeed) {
            const offset = view.armOffset(0);
            const camPos = offsetBrick(sceneCamLocal!.position, offset)!;
            const camLookAt = offsetBrick(sceneCamLocal!.lookAt, offset)!;
            view.setSceneCamera(camPos, camLookAt);
            view.setWebcam(camPos, camLookAt);
            view.render({ x: pipX, y: pipY, width: pipWidth, height: pipHeight });
            // The DOM frame sits over the canvas at the matching on-screen
            // spot: the canvas box is itself a percentage of the whole scene,
            // so the pip's position within it needs converting the same way.
            camFeed.style.left = `${((b.left + pipX) / size.width) * 100}%`;
            camFeed.style.top = `${((b.top + pipY) / size.height) * 100}%`;
            camFeed.style.width = `${(pipWidth / size.width) * 100}%`;
            camFeed.style.height = `${(pipHeight / size.height) * 100}%`;
          } else {
            view.hideWebcam();
            view.render();
          }

          // The strip chart traces live, beside the camera feed: only the
          // part of the curve already "recorded" (task <= current progress)
          // is drawn, the same way the video only has frames up to now.
          graph.hidden = !running;
          if (running) {
            const progress = state.task as number;
            const [low, high] = ELBOW_RANGE;
            const toSvgY = (v: number) => 88 - ((v - low) / (high - low)) * 86;
            const points = ELBOW_SAMPLES.filter((s) => s.t <= progress)
              .map((s) => `${s.t * 200},${toSvgY(s.v)}`)
              .join(" ");
            graphTrace.setAttribute("points", points);
            const current = taskFrame(progress).elbow;
            graphDot.setAttribute("cx", String(progress * 200));
            graphDot.setAttribute("cy", String(toSvgY(current)));

            const graphWidth = pipX - margin - margin;
            graph.style.left = `${((b.left + margin) / size.width) * 100}%`;
            graph.style.top = `${((b.top + pipY) / size.height) * 100}%`;
            graph.style.width = `${(graphWidth / size.width) * 100}%`;
            graph.style.height = `${(pipHeight / size.height) * 100}%`;
          }
        } else if (!failed) {
          status.hidden = introBeat;
        }
        // The follower is on screen from the start; the leader label should
        // only appear once the leader arm itself does.
        names.hidden = !ready;
        leaderName.hidden = !pair;

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

        const diagramState = String(state.diagram);
        diagram.hidden = diagramState === "none";
        if (diagramState !== "none" && shownDiagram !== diagramState) {
          diagramImg.src = diagramState === "workflow1" ? LEROBOT_WORKFLOW_TOP : LEROBOT_WORKFLOW_BOTTOM;
          shownDiagram = diagramState;
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
.so101-logo { display: block; width: 34px; height: 34px; border-radius: 7px; object-fit: contain; background: #fff; transition: width 900ms ease, height 900ms ease; }
.so101-kicker { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${MUTED}; }
/* The LeRobot introduction beat: the mark already used for the credit line
   grows in place, with a name beside it, then shrinks back for the rest of
   the scene. Kept as a plain opacity/size transition, not a new layout, so
   nothing else on screen has to move out of its way. */
.so101-brand-label { margin: 2px 0 0; font-size: 15px; font-weight: 800; color: ${INK}; opacity: 0; max-height: 0; overflow: hidden; transition: opacity 700ms ease; }
.so101-brand-intro .so101-logo { width: 76px; height: 76px; }
.so101-brand-intro .so101-brand-label { opacity: 1; max-height: 30px; font-size: 26px; }
/* Nothing about the 3D view — canvas, its credit line — belongs on screen
   until the LeRobot introduction is done with the screen. */
.so101-brand-intro .so101-credit { display: none; }
.so101-brand-intro h1 { visibility: hidden; }
.so101-brand-intro .so101-names { display: none; }
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
/* LeRobot's own workflow diagram, centred over the canvas's own box (not the
   whole scene) so it never reaches into the note/board area on the right. */
.so101-diagram { position: absolute; left: 33%; top: 58%; transform: translate(-50%, -50%); width: 56%; max-width: 600px; margin: 0; padding: 10px; background: rgba(255, 255, 255, .97); border-radius: 10px; box-shadow: 0 10px 30px rgba(0, 0, 0, .22); }
.so101-diagram-img { display: block; width: 100%; height: auto; border-radius: 6px; }
/* A second, live viewport rendered straight into the same WebGL canvas
   (renderer.setScissor); this frame is just the border and caption drawn
   over that rectangle, positioned to match it every frame. */
.so101-camfeed { position: absolute; margin: 0; border: 2px solid ${INK}; border-radius: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, .3); pointer-events: none; }
.so101-camfeed figcaption { position: absolute; left: 0; right: 0; bottom: 0; margin: 0; padding: 3px 6px; font-size: 10px; font-weight: 700; color: #fff; background: rgba(0, 0, 0, .55); border-radius: 0 0 4px 4px; }
/* A strip chart beside the camera feed: only the recorded portion of the
   curve is drawn each frame, so it fills in live rather than showing the
   whole shape up front. */
.so101-graph { position: absolute; margin: 0; padding: 4px; background: rgba(255, 255, 255, .92); border: 1px solid ${MUTED}; border-radius: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, .22); pointer-events: none; }
.so101-graph svg { display: block; width: 100%; height: calc(100% - 16px); }
.so101-graph-zero { stroke: ${MUTED}; stroke-width: .5; stroke-dasharray: 2 2; }
.so101-graph-trace { fill: none; stroke: ${LINK2}; stroke-width: 2; }
.so101-graph-dot { fill: ${LINK2}; }
.so101-graph figcaption { margin: 2px 0 0; font-size: 10px; font-weight: 700; color: ${INK}; text-align: center; }
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
