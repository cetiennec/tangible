import type { PlainState } from "@tangible/core";
import type { ParameterActivityMap, SceneContext } from "@tangible/player";
import {
  elbowBranch,
  JOINT_LIMITS,
  forwardKinematics,
  inverseKinematics,
  MAX_LINK_CM,
  MIN_LINK_CM,
  TAU,
} from "./kinematics.js";

export const INK = "#23303a";
export const MUTED = "#6c7f86";
export const LINK1 = "#1f6f8b";
export const LINK2 = "#c2622d";
export const TIP = "#b5322b";
export const WORKSPACE = "#1f6f8b";

interface SliderSpec {
  param: string;
  label: string;
  aria: string;
  min: number;
  max: number;
  step: number;
  digits: number;
  unit: string;
  /** The joint's real travel, shaded on the slider when limits are in force. */
  limit?: readonly [number, number];
}

const ANGLE_SLIDERS: SliderSpec[] = [
  { param: "q1", label: "q₁", aria: "Motor 1 angle q1 in radians", min: 0, max: TAU, step: 0.001, digits: 2, unit: "rad", limit: JOINT_LIMITS.q1 },
  { param: "q2", label: "q₂", aria: "Motor 2 angle q2 in radians", min: -Math.PI, max: Math.PI, step: 0.001, digits: 2, unit: "rad", limit: JOINT_LIMITS.q2 },
];

const LINK_SLIDERS: SliderSpec[] = [
  { param: "l1", label: "L₁", aria: "Length of link 1 in centimetres", min: MIN_LINK_CM, max: MAX_LINK_CM, step: 0.1, digits: 1, unit: "cm" },
  { param: "l2", label: "L₂", aria: "Length of link 2 in centimetres", min: MIN_LINK_CM, max: MAX_LINK_CM, step: 0.1, digits: 1, unit: "cm" },
];

const ALL_SLIDERS = [...ANGLE_SLIDERS, ...LINK_SLIDERS];

const CANVAS_DESCRIPTION =
  "A two-link robot arm with two degrees of freedom, seen from above. Motor 1 at the base " +
  "turns link 1 by the angle q1, and motor 2 at the elbow turns link 2 by the angle q2. " +
  "The end-effector is the tip of link 2. The sliders beside the drawing set both angles " +
  "and both link lengths, and a button switches between the two elbow solutions.";

/** The right-hand control panel and its live readouts. */
export function armControls(ctx: SceneContext) {
  const root = document.createElement("section");
  root.className = "ik-scene";
  root.innerHTML = `
    <header>
      <p class="ik-kicker">Planar robot arm</p>
      <h1>Joint angles and where the tip reaches</h1>
      <p class="ik-lede">Drag the elbow to turn link 1. Drag the end-effector and both angles solve themselves.</p>
    </header>
    <figure class="ik-human" hidden>
      <svg viewBox="0 0 210 250" role="img"
        aria-label="A simple figure of a person. The upper arm and the forearm are drawn the same length, which is why a person can touch their own shoulder.">
        <g class="ik-body">
          <circle cx="86" cy="32" r="19"></circle>
          <path d="M86 51 L86 146"></path>
          <path d="M86 146 L64 228"></path>
          <path d="M86 146 L108 228"></path>
          <path d="M86 68 L52 104"></path>
          <path d="M52 104 L52 152"></path>
        </g>
        <path class="ik-upper" d="M86 68 L121 103"></path>
        <path class="ik-fore" d="M121 103 L121 152"></path>
        <circle class="ik-elbow" cx="121" cy="103" r="6"></circle>
        <text class="ik-human-label ik-upper-label" x="131" y="80">upper arm</text>
        <text class="ik-human-label ik-fore-label" x="131" y="132">forearm</text>
      </svg>
      <figcaption>Nearly the same length &mdash; which is why you can touch your own shoulder.</figcaption>
    </figure>
    <div class="ik-panel">
      <p class="ik-group">Joint angles</p>
      ${ANGLE_SLIDERS.map(sliderMarkup).join("")}
      <p class="ik-group">Link lengths</p>
      ${LINK_SLIDERS.map(sliderMarkup).join("")}
      <p class="ik-group">The other solution</p>
      <button type="button" class="ik-button" data-action="flip-elbow"></button>
      <button type="button" class="ik-button ik-toggle" data-param="show.workspace" aria-pressed="false">Show reachable space</button>
    </div>
  `;
  const style = document.createElement("style");
  style.textContent = STYLE;
  const player = ctx.overlay.parentElement!;
  player.classList.add("ik-player");
  ctx.canvas.setAttribute("role", "img");
  ctx.canvas.setAttribute("aria-label", CANVAS_DESCRIPTION);
  ctx.overlay.append(style, root);

  const rows = new Map(ALL_SLIDERS.map((spec) => [spec.param, root.querySelector<HTMLElement>(`[data-row="${spec.param}"]`)!]));
  const sliders = new Map(ALL_SLIDERS.map((spec) => [spec.param, root.querySelector<HTMLInputElement>(`input[data-param="${spec.param}"]`)!]));
  const values = new Map(ALL_SLIDERS.map((spec) => [spec.param, root.querySelector<HTMLElement>(`[data-value="${spec.param}"]`)!]));
  const workspaceButton = root.querySelector<HTMLButtonElement>(`button[data-param="show.workspace"]`)!;
  const flipButton = root.querySelector<HTMLButtonElement>(`button[data-action="flip-elbow"]`)!;
  const kicker = root.querySelector<HTMLElement>(".ik-kicker")!;
  const human = root.querySelector<HTMLElement>(".ik-human")!;
  const stops = ALL_SLIDERS.flatMap((spec) => {
    const fractions = stopFractions(spec);
    if (!fractions) return [];
    const low = root.querySelector<HTMLElement>(`[data-stop="low-${spec.param}"]`)!;
    const high = root.querySelector<HTMLElement>(`[data-stop="high-${spec.param}"]`)!;
    // The shaded ends are the travel the joint does not have.
    low.style.width = `${fractions.low * 100}%`;
    high.style.left = `${fractions.high * 100}%`;
    high.style.width = `${(1 - fractions.high) * 100}%`;
    return [low, high];
  });

  let current: Readonly<PlainState> = {};

  const onSlider = (event: Event) => {
    const input = event.target as HTMLInputElement;
    ctx.write(input.dataset.param!, Number(input.value));
  };
  const onWorkspace = () => ctx.write("show.workspace", workspaceButton.getAttribute("aria-pressed") !== "true");

  // Reach the same point with the elbow bent the other way: solve the inverse
  // problem again for the tip the arm is already touching.
  const onFlip = () => {
    const [q1, q2, l1, l2] = ["q1", "q2", "l1", "l2"].map((key) => current[key] as number);
    const { tip } = forwardKinematics(q1, q2, l1, l2);
    const other = elbowBranch(q2) === "up" ? "down" : "up";
    const solved = inverseKinematics(tip, l1, l2, other);
    ctx.write("q1", solved.q1);
    ctx.write("q2", solved.q2);
  };

  for (const input of sliders.values()) input.addEventListener("input", onSlider);
  workspaceButton.addEventListener("click", onWorkspace);
  flipButton.addEventListener("click", onFlip);

  return {
    render(state: Readonly<PlainState>, activity: ParameterActivityMap) {
      current = state;
      for (const spec of ALL_SLIDERS) {
        const value = state[spec.param] as number;
        sliders.get(spec.param)!.value = String(value);
        values.get(spec.param)!.textContent = `${value.toFixed(spec.digits)} ${spec.unit}`;
        rows.get(spec.param)!.classList.toggle("ik-active", Boolean(activity[spec.param]));
      }
      const showing = state["show.workspace"] as boolean;
      workspaceButton.setAttribute("aria-pressed", String(showing));
      workspaceButton.textContent = showing ? "Hide reachable space" : "Show reachable space";
      workspaceButton.classList.toggle("ik-active", Boolean(activity["show.workspace"]));
      flipButton.textContent =
        elbowBranch(state.q2 as number) === "up" ? "Flip to elbow-down" : "Flip to elbow-up";
      // The heading must not announce the degrees of freedom before the
      // narration gets there.
      kicker.textContent = state["label.dof"] ? "2 DOF planar arm" : "Planar robot arm";
      human.hidden = !state["show.human"];
      const limited = Boolean(state["show.limits"]);
      for (const stop of stops) stop.hidden = !limited;
    },
    dispose() {
      for (const input of sliders.values()) input.removeEventListener("input", onSlider);
      workspaceButton.removeEventListener("click", onWorkspace);
      flipButton.removeEventListener("click", onFlip);
      root.remove();
      style.remove();
      player.classList.remove("ik-player");
    },
  };
}

function sliderMarkup(spec: SliderSpec): string {
  const bars = spec.limit
    ? `<span class="ik-stop ik-stop-low" data-stop="low-${spec.param}"></span>
       <span class="ik-stop ik-stop-high" data-stop="high-${spec.param}"></span>`
    : "";
  return `<div class="ik-row" data-row="${spec.param}">
      <p class="ik-label"><span>${spec.label}</span><span data-value="${spec.param}"></span></p>
      <div class="ik-track">${bars}<input type="range" data-param="${spec.param}" min="${spec.min}" max="${spec.max}" step="${spec.step}" aria-label="${spec.aria}"></div>
    </div>`;
}

/** Where a joint's travel begins and ends, as fractions of its slider. */
export function stopFractions(spec: SliderSpec): { low: number; high: number } | undefined {
  if (!spec.limit) return undefined;
  const span = spec.max - spec.min;
  return { low: (spec.limit[0] - spec.min) / span, high: (spec.limit[1] - spec.min) / span };
}

const STYLE = `
.ik-player { background: #f4f6f4; color: ${INK}; }
.ik-scene { font-family: system-ui, sans-serif; }
.ik-scene header { position: absolute; top: 5%; left: 4%; width: 54%; }
.ik-kicker { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${MUTED}; }
.ik-scene h1 { margin: 0; font-size: clamp(17px, 2.4vw, 29px); line-height: 1.15; font-weight: 600; }
.ik-lede { margin: 7px 0 0; max-width: 46ch; font-size: 13px; line-height: 1.35; color: ${MUTED}; }
.ik-panel { position: absolute; top: 26%; right: 3%; bottom: 60px; display: flex; flex-direction: column; gap: 7px; width: 25%; overflow: hidden; pointer-events: auto; }
.ik-group { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${MUTED}; }
.ik-row { border-left: 3px solid transparent; padding-left: 7px; transition: border-color 160ms ease; }
.ik-row.ik-active { border-left-color: ${TIP}; }
.ik-label { display: flex; justify-content: space-between; gap: 8px; margin: 0; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ik-track { position: relative; }
.ik-stop { position: absolute; top: 50%; height: 12px; transform: translateY(-50%); border-radius: 3px; background: repeating-linear-gradient(135deg, rgba(181,50,43,.40) 0 4px, rgba(181,50,43,.14) 4px 8px); pointer-events: none; }
.ik-stop-low { left: 0; }
.ik-row input { display: block; box-sizing: border-box; width: 100%; height: 44px; margin: 0; accent-color: ${LINK1}; cursor: pointer; }
.ik-row input:focus-visible { outline: 3px solid ${TIP}; outline-offset: 2px; }
.ik-button { width: 100%; min-height: 44px; padding: 10px 12px; border: 1.5px solid ${WORKSPACE}; border-radius: 8px; background: transparent; color: ${WORKSPACE}; font: 600 14px system-ui, sans-serif; cursor: pointer; }
.ik-button:hover { background: rgba(31, 111, 139, 0.09); }
.ik-button:focus-visible { outline: 3px solid ${TIP}; outline-offset: 2px; }
.ik-toggle[aria-pressed="true"] { background: ${WORKSPACE}; color: #ffffff; }
.ik-button.ik-active { box-shadow: 0 0 0 3px rgba(181, 50, 43, 0.3); }
.ik-human { position: absolute; left: 3%; top: 21%; width: 27%; margin: 0; padding: 12px 10px 10px; border-radius: 12px; background: rgba(255, 255, 255, .93); box-shadow: 0 6px 22px rgba(35, 48, 58, .12); }
.ik-human svg { display: block; width: 100%; height: auto; }
.ik-human .ik-body { fill: none; stroke: ${MUTED}; stroke-width: 5; stroke-linecap: round; opacity: .55; }
.ik-human .ik-body circle { fill: none; }
.ik-human .ik-upper { fill: none; stroke: ${LINK1}; stroke-width: 9; stroke-linecap: round; }
.ik-human .ik-fore { fill: none; stroke: ${LINK2}; stroke-width: 9; stroke-linecap: round; }
.ik-human .ik-elbow { fill: #ffffff; stroke: ${INK}; stroke-width: 2.5; }
.ik-human-label { font: 700 12px system-ui, sans-serif; }
.ik-upper-label { fill: ${LINK1}; }
.ik-fore-label { fill: ${LINK2}; }
.ik-human figcaption { margin-top: 6px; font-size: 12px; line-height: 1.4; text-align: center; color: ${MUTED}; }
/* Vocabulary the narration introduces, shown as a chip above its maths. */
.ik-player .xv-board-inner { gap: 8px; }
.ik-player .xv-board-item[data-id^="kw"] {
  padding: 7px 11px; border-left: 4px solid ${TIP}; border-radius: 0 8px 8px 0;
  background: rgba(255, 255, 255, .92); font: 700 14px system-ui, sans-serif; color: ${INK};
}
.ik-player .xv-board { top: 3%; right: 3%; width: 30%; height: 21%; padding: 0; font-size: 15px; }
.ik-player .xv-captions { color: ${INK}; text-shadow: none; }
@media (max-height: 500px) and (orientation: landscape) {
  .ik-scene header { width: 58%; }
  .ik-scene h1 { font-size: 16px; }
  .ik-panel { top: 22%; gap: 4px; }
  .ik-lede { display: none; }
  .ik-human { position: absolute; left: 3%; top: 21%; width: 27%; margin: 0; padding: 12px 10px 10px; border-radius: 12px; background: rgba(255, 255, 255, .93); box-shadow: 0 6px 22px rgba(35, 48, 58, .12); }
.ik-human svg { display: block; width: 100%; height: auto; }
.ik-human .ik-body { fill: none; stroke: ${MUTED}; stroke-width: 5; stroke-linecap: round; opacity: .55; }
.ik-human .ik-body circle { fill: none; }
.ik-human .ik-upper { fill: none; stroke: ${LINK1}; stroke-width: 9; stroke-linecap: round; }
.ik-human .ik-fore { fill: none; stroke: ${LINK2}; stroke-width: 9; stroke-linecap: round; }
.ik-human .ik-elbow { fill: #ffffff; stroke: ${INK}; stroke-width: 2.5; }
.ik-human-label { font: 700 12px system-ui, sans-serif; }
.ik-upper-label { fill: ${LINK1}; }
.ik-fore-label { fill: ${LINK2}; }
.ik-human figcaption { margin-top: 6px; font-size: 12px; line-height: 1.4; text-align: center; color: ${MUTED}; }
/* Vocabulary the narration introduces, shown as a chip above its maths. */
.ik-player .xv-board-inner { gap: 8px; }
.ik-player .xv-board-item[data-id^="kw"] {
  padding: 7px 11px; border-left: 4px solid ${TIP}; border-radius: 0 8px 8px 0;
  background: rgba(255, 255, 255, .92); font: 700 14px system-ui, sans-serif; color: ${INK};
}
.ik-player .xv-board { font-size: 12px; }
}
`;
