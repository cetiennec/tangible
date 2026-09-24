import type { OrbitState, PlainState, Schema } from "@tangible/core";
import { orbitHandle } from "@tangible/ingredients";
import type { SceneContext, SceneModule } from "@tangible/player";
import { INK, LINK1, LINK2, MUTED, TIP } from "./controls.js";
import { calloutGap, placeCallouts } from "./labels.js";
import { type Feed, RobotView, warmRobotAssets } from "./so101-view.js";
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

// The board's own width, which both right-hand panels share. The feed needs
// it as a number as well as in CSS, because its canvas has to be given a
// pixel size to render into; the two must agree or the image is stretched.
const PANEL_WIDTH = 0.32;
const FEED_ASPECT = 16 / 9;
/** The gap between the two feeds when both are on screen, in CSS pixels. */
const FEED_GAP = 6;

const HOME: OrbitState = { target: [0, 0.12, 0], distance: 0.95, azimuth: 0.9, elevation: 0.42 };

/** The elbow's full mechanical travel, quoted on the chart for scale. */
const ELBOW_TRAVEL = JOINTS.find((j) => j.param === "elbow")!.range;
// The follower's real control loop lags the leader's by a little; the 3D
// motion itself stays perfectly synchronised (the point of this demo is that
// the copy needs no calculation), but the graph shows the small real delay a
// physical system would have between commanded and actual position.
const FOLLOWER_DELAY = 0.03;
/** Elbow angle across the task, sampled once — a fixed curve to trace live. */
const ELBOW_SAMPLES_LEADER = Array.from({ length: 101 }, (_unused, i) => {
  const t = i / 100;
  return { t, v: taskFrame(t).elbow };
});
const ELBOW_SAMPLES_FOLLOWER = Array.from({ length: 101 }, (_unused, i) => {
  const t = i / 100;
  return { t, v: taskFrame(t - FOLLOWER_DELAY).elbow };
});
/**
 * The chart's Y axis: the span this task actually visits, padded a little.
 *
 * It used to be the joint's whole mechanical travel, which is a fair thing
 * to show but left the two traces squeezed into the top fifth of the box,
 * exactly where the small delay between them is hardest to see. The axis is
 * labelled with its own numbers and the full travel is quoted in the
 * caption, so nothing is lost by scaling to the part in use.
 */
const ELBOW_AXIS = (() => {
  const values = [...ELBOW_SAMPLES_LEADER, ...ELBOW_SAMPLES_FOLLOWER].map((sample) => sample.v);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low) * 0.15;
  return [low - pad, high + pad] as const;
})();
/** The plot area inside the chart's own 230 by 100 coordinates. */
const PLOT = { left: 27, right: 226, top: 9, bottom: 80 };

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
  "show.wristCam": {
    type: { kind: "boolean" },
    default: false,
    interpolate: "snap",
    ownership: "script",
    label: "add a second camera on the gripper, with its own feed",
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
  activePart: {
    type: { kind: "enum", values: ["none", "all", ...JOINTS.map((entry) => entry.joint)] },
    default: "none",
    interpolate: "snap",
    ownership: "script",
    label: "name one joint on the follower at a time, for the introduction, or all six to check the matching exercise",
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

// No "leader" entry: that note's screen spot (right:3%, top:32%) is where
// the camera feed and strip chart sit once the task starts.
const NOTES: Record<string, { title: string; body: string; accent: string }> = {
  phone: {
    title: "Phone as teleoperator",
    body: "The operator moves a pose in Cartesian space, so the arm must solve IK to find its joint angles.",
    accent: TIP,
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
      <div class="so101-feeds" hidden>
        <figure class="so101-camfeed" hidden>
          <canvas class="so101-camfeed-view" aria-hidden="true"></canvas>
          <figcaption>Workspace camera</figcaption>
        </figure>
        <figure class="so101-camfeed so101-wristfeed" hidden>
          <canvas class="so101-wristfeed-view" aria-hidden="true"></canvas>
          <figcaption>Wrist camera</figcaption>
        </figure>
      </div>
      <figure class="so101-graph" hidden>
        <svg viewBox="0 0 230 100" preserveAspectRatio="none" aria-hidden="true">
          <line class="so101-graph-rule" x1="${PLOT.left}" y1="${PLOT.top}" x2="${PLOT.right}" y2="${PLOT.top}"></line>
          <line class="so101-graph-rule" x1="${PLOT.left}" y1="${(PLOT.top + PLOT.bottom) / 2}" x2="${PLOT.right}" y2="${(PLOT.top + PLOT.bottom) / 2}"></line>
          <line class="so101-graph-axis" x1="${PLOT.left}" y1="${PLOT.top}" x2="${PLOT.left}" y2="${PLOT.bottom}"></line>
          <line class="so101-graph-axis" x1="${PLOT.left}" y1="${PLOT.bottom}" x2="${PLOT.right}" y2="${PLOT.bottom}"></line>
          <text class="so101-graph-tick" x="${PLOT.left - 4}" y="${PLOT.top + 3}"></text>
          <text class="so101-graph-tick" x="${PLOT.left - 4}" y="${(PLOT.top + PLOT.bottom) / 2 + 3}"></text>
          <text class="so101-graph-tick" x="${PLOT.left - 4}" y="${PLOT.bottom + 3}"></text>
          <text class="so101-graph-axislabel" x="${PLOT.right}" y="${PLOT.bottom + 13}">through the run →</text>
          <polyline class="so101-graph-trace so101-graph-leader" points=""></polyline>
          <polyline class="so101-graph-trace so101-graph-follower" points=""></polyline>
          <circle class="so101-graph-dot so101-graph-dot-leader" r="2.6"></circle>
          <circle class="so101-graph-dot so101-graph-dot-follower" r="2.6"></circle>
        </svg>
        <figcaption>Elbow angle in radians (joint travels ${ELBOW_TRAVEL[0].toFixed(2)} to ${ELBOW_TRAVEL[1].toFixed(2)}) — <span class="so101-graph-key so101-graph-key-leader">leader</span> <span class="so101-graph-key so101-graph-key-follower">follower</span></figcaption>
      </figure>
      <div class="so101-parts" hidden>
        ${JOINTS.map((entry) => `<span class="so101-part" data-joint="${entry.joint}" hidden>${entry.label}</span>`).join("")}
      </div>
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
    const feeds = root.querySelector<HTMLElement>(".so101-feeds")!;
    const camFeed = root.querySelector<HTMLElement>(".so101-camfeed")!;
    const camFeedView = root.querySelector<HTMLCanvasElement>(".so101-camfeed-view")!;
    const wristFeed = root.querySelector<HTMLElement>(".so101-wristfeed")!;
    const wristFeedView = root.querySelector<HTMLCanvasElement>(".so101-wristfeed-view")!;
    const graph = root.querySelector<HTMLElement>(".so101-graph")!;
    const graphTicks = [...root.querySelectorAll<SVGTextElement>(".so101-graph-tick")];
    const graphLeaderTrace = root.querySelector<SVGPolylineElement>(".so101-graph-leader")!;
    const graphFollowerTrace = root.querySelector<SVGPolylineElement>(".so101-graph-follower")!;
    const graphLeaderDot = root.querySelector<SVGCircleElement>(".so101-graph-dot-leader")!;
    const graphFollowerDot = root.querySelector<SVGCircleElement>(".so101-graph-dot-follower")!;
    const partsContainer = root.querySelector<HTMLElement>(".so101-parts")!;
    const partLabels = new Map(
      JOINTS.map((entry) => [entry.joint, root.querySelector<HTMLElement>(`.so101-part[data-joint="${entry.joint}"]`)!]),
    );
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
          // Mounted overhead, looking straight down at the midpoint — a
          // fixed external view, not one that tracks the gripper, the way a
          // real recording camera bolted above the workspace would be. The
          // small z offset keeps the view a few degrees off true vertical,
          // away from the up-vector singularity a perfectly straight-down
          // look would hit.
          sceneCamLocal = { position: [mid[0], mid[1] + 0.35, mid[2] + 0.08], lookAt: mid };
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

          // Both panels sit in the board's own rectangle on the right, the
          // chart above the feed. The narration empties the board just
          // before the task and fills it again afterwards, so there is
          // nothing underneath them there, and CSS can place them outright
          // rather than the render loop working out where they go.
          const showFeed = running && Boolean(sceneCamLocal);
          const showWrist = showFeed && Boolean(state["show.wristCam"]);
          feeds.hidden = !showFeed;
          camFeed.hidden = !showFeed;
          wristFeed.hidden = !showWrist;
          view.setWristCamera(showWrist, 0);
          const panel: Feed[] = [];
          if (showFeed) {
            const offset = view.armOffset(0);
            const camPos = offsetBrick(sceneCamLocal!.position, offset)!;
            const camLookAt = offsetBrick(sceneCamLocal!.lookAt, offset)!;
            view.setSceneCamera(camPos, camLookAt);
            view.setWebcam(camPos, camLookAt);
            // The two feeds share the panel's width when both are up, so the
            // pixels each is rendered at have to follow what CSS gives them.
            const column = size.width * PANEL_WIDTH;
            const width = showWrist ? (column - FEED_GAP) / 2 : column;
            panel.push({ source: "workspace", canvas: camFeedView, width, height: width / FEED_ASPECT });
            if (showWrist) {
              panel.push({ source: "wrist", canvas: wristFeedView, width, height: width / FEED_ASPECT });
            }
          } else {
            view.hideWebcam();
          }
          view.render(panel);

          // The strip chart traces live, directly above the camera feed:
          // only the part of each curve already "recorded" (task <= current
          // progress) is drawn, the same way the video only has frames up to
          // now. The follower's trace runs a beat behind the leader's.
          graph.hidden = !running;
          if (running) {
            const progress = state.task as number;
            const [low, high] = ELBOW_AXIS;
            const toY = (v: number) => PLOT.bottom - ((v - low) / (high - low)) * (PLOT.bottom - PLOT.top);
            const toX = (t: number) => PLOT.left + t * (PLOT.right - PLOT.left);
            const trace = (samples: typeof ELBOW_SAMPLES_LEADER) =>
              samples
                .filter((sample) => sample.t <= progress)
                .map((sample) => `${toX(sample.t).toFixed(1)},${toY(sample.v).toFixed(1)}`)
                .join(" ");
            graphLeaderTrace.setAttribute("points", trace(ELBOW_SAMPLES_LEADER));
            graphFollowerTrace.setAttribute("points", trace(ELBOW_SAMPLES_FOLLOWER));
            graphLeaderDot.setAttribute("cx", String(toX(progress)));
            graphLeaderDot.setAttribute("cy", String(toY(taskFrame(progress).elbow)));
            graphFollowerDot.setAttribute("cx", String(toX(progress)));
            graphFollowerDot.setAttribute("cy", String(toY(taskFrame(progress - FOLLOWER_DELAY).elbow)));
            // Written once the scale is known rather than baked into the
            // markup, so the axis and its labels cannot drift apart.
            const labels = [high, (low + high) / 2, low].map((v) => v.toFixed(2));
            graphTicks.forEach((tick, i) => {
              if (tick.textContent !== labels[i]) tick.textContent = labels[i]!;
            });
          }

          // Name one joint at a time, where it actually is, projected from
          // its live 3D position, in step with the narration: activePart
          // changes as each name is spoken, so a label appears, then makes
          // way for the next rather than all six crowding the arm at once.
          // "all" shows every name together, briefly, as the answer to the
          // matching exercise.
          const activePart = String(state.activePart);
          const b = box();
          partsContainer.hidden = activePart === "none";
          const shown: { label: HTMLElement; x: number; y: number }[] = [];
          for (const entry of JOINTS) {
            const label = partLabels.get(entry.joint)!;
            if (activePart !== "all" && entry.joint !== activePart) {
              label.hidden = true;
              continue;
            }
            const world = view.jointWorldPosition(entry.joint, 0);
            const at = world && view.projectToScreen(world, b.width, b.height);
            label.hidden = !at;
            label.style.transform = "";
            if (at) {
              label.style.left = `${((b.left + at.x) / size.width) * 100}%`;
              label.style.top = `${((b.top + at.y) / size.height) * 100}%`;
              shown.push({ label, x: b.left + at.x, y: b.top + at.y });
            }
          }
          // Six names at once crowd the wrist, where three joints sit close
          // together, so each is moved to whichever side of its joint is free.
          if (activePart === "all") {
            const items = shown.map(({ label, x, y }) => ({ x, y, width: label.offsetWidth, height: label.offsetHeight }));
            placeCallouts(items).forEach(({ side, level }, i) => {
              const gap = calloutGap(items[i]!.height, level);
              shown[i]!.label.style.transform =
                side === "above" ? `translate(-50%, calc(-100% - ${gap}px))`
                : side === "below" ? `translate(-50%, ${gap}px)`
                : side === "right" ? `translate(${gap}px, -50%)`
                : `translate(calc(-100% - ${gap}px), -50%)`;
            });
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
/* root (this section) and the WebGL canvas are both plain absolute-position
   siblings of the overlay with no stacking context of their own, so without
   this they stack in DOM order — the canvas was appended after root, so
   every label here (joint names especially, drawn right over the model)
   painted behind it instead of on top. */
.so101-scene { position: relative; z-index: 1; width: 100%; height: 100%; font-family: system-ui, sans-serif; }
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
/* The two recording panels, stacked in the board's own rectangle on the
   right: the strip chart first, the camera feed under it. Widths here must
   stay in step with PANEL_WIDTH above, which sizes the feed's pixels. */
/* The feed is a plain 2D canvas that the 3D view copies the recording
   camera's pass into each frame; its height comes from the canvas's own
   pixel aspect, so nothing has to state it twice. */
.so101-feeds { position: absolute; right: 3%; top: 34%; width: 32%; display: flex; align-items: flex-start; gap: 6px; pointer-events: none; }
/* Each feed takes an equal share of the row, so the pair that appears when
   the gripper camera arrives simply halves the single one. Heights follow
   from the canvas's own pixel aspect, so nothing states them twice. */
.so101-camfeed { flex: 1 1 0; min-width: 0; position: relative; margin: 0; border: 2px solid ${INK}; border-radius: 6px; overflow: hidden; background: #20262a; box-shadow: 0 6px 18px rgba(0, 0, 0, .3); }
.so101-camfeed canvas { display: block; width: 100%; height: auto; }
.so101-camfeed figcaption { position: absolute; left: 0; right: 0; bottom: 0; margin: 0; padding: 3px 6px; font-size: 10px; font-weight: 700; color: #fff; background: rgba(0, 0, 0, .55); }
/* Only the recorded portion of each curve is drawn each frame, so the chart
   fills in live rather than showing the whole shape up front. */
.so101-graph { position: absolute; right: 3%; top: 5%; width: 32%; height: 26%; margin: 0; padding: 8px; box-sizing: border-box; background: rgba(255, 255, 255, .92); border: 1px solid ${MUTED}; border-radius: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, .22); pointer-events: none; }
.so101-graph svg { display: block; width: 100%; height: calc(100% - 16px); }
/* The viewBox is 230 by 100 to match the panel's own proportions, so the
   stretch to fill it is close to one to one and nothing is visibly
   distorted. Strokes are kept off the scaling anyway. */
.so101-graph-axis { stroke: ${INK}; stroke-width: 1; opacity: .5; vector-effect: non-scaling-stroke; }
.so101-graph-rule { stroke: ${MUTED}; stroke-width: 1; stroke-dasharray: 3 3; opacity: .45; vector-effect: non-scaling-stroke; }
.so101-graph-tick { fill: ${MUTED}; font: 600 7px system-ui, sans-serif; text-anchor: end; }
.so101-graph-axislabel { fill: ${MUTED}; font: 600 7px system-ui, sans-serif; text-anchor: end; }
.so101-graph-trace { fill: none; stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.so101-graph-leader { stroke: ${LINK1}; }
.so101-graph-follower { stroke: ${TIP}; stroke-dasharray: 5 3; vector-effect: non-scaling-stroke; }
.so101-graph-dot-leader { fill: ${LINK1}; }
.so101-graph-dot-follower { fill: ${TIP}; }
.so101-graph figcaption { margin: 2px 0 0; font-size: 10px; font-weight: 600; color: ${MUTED}; text-align: center; }
.so101-graph-key::before { content: "●"; margin-right: 2px; }
.so101-graph-key-leader { color: ${LINK1}; }
.so101-graph-key-follower { color: ${TIP}; }
/* One label per joint, each positioned from its own projected 3D point every
   frame; the container only toggles which set is in play. */
.so101-parts { pointer-events: none; }
.so101-part { position: absolute; transform: translate(-50%, -130%); padding: 3px 9px; border-radius: 999px; background: rgba(255, 255, 255, .95); border: 1px solid ${INK}; font-size: 13px; font-weight: 700; color: ${INK}; white-space: nowrap; }
.so101-player .xv-board { top: 4%; right: 3%; width: 32%; height: 56%; padding: 0; font-size: 16px; }
/* Every card on this scene's board reads as a labelled block. The closing
   list of topics was styled this way and it is far easier to read across a
   room than plain lines, so the LeRobot introduction uses it too. The one
   exception is "later", which is a small heading above its list. */
.so101-player .xv-board-inner { gap: 8px; }
.so101-player .xv-board-item {
  padding: 11px 14px; border-left: 4px solid ${LINK1}; border-radius: 0 9px 9px 0;
  background: rgba(255, 255, 255, .92); font-size: 17px; font-weight: 600; line-height: 1.25; color: ${INK};
}
.so101-player .xv-board-item[data-id="later"] {
  padding: 2px 0 0; border-left: 0; border-radius: 0; background: none;
  font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${MUTED};
}
.so101-player .xv-captions { color: ${INK}; text-shadow: none; }
@media (max-height: 500px) and (orientation: landscape) {
  .so101-scene h1 { font-size: 15px; }
  .so101-note { top: 28%; padding: 9px 11px; }
  .so101-graph { padding: 6px; }
  .so101-note-body { font-size: 11px; }
  .so101-credit { display: none; }
}
`;
