import type { PlainState } from "@tangible/core";
import type { ParameterActivityMap, SceneContext } from "@tangible/player";
import {
  MAX_LINK_CM,
  MIN_LINK_CM,
  NORMALIZED_AREA,
  reachableArea,
  SQ_CM_PER_SQ_M,
  TAU,
} from "./kinematics.js";

// Plot box in the SVG's own coordinates. The vertical axis runs from zero to
// PLOT_MAX so that the constant level sits well clear of the baseline.
const PLOT = { left: 36, right: 290, top: 12, bottom: 74, max: 16 };
const plotX = (fraction: number) => PLOT.left + fraction * (PLOT.right - PLOT.left);
const plotY = (value: number) => PLOT.bottom - (value / PLOT.max) * (PLOT.bottom - PLOT.top);
const LEVEL_Y = plotY(NORMALIZED_AREA);

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
}

const ANGLE_SLIDERS: SliderSpec[] = [
  { param: "q1", label: "q₁", aria: "Shoulder angle q1 in radians", min: 0, max: TAU, step: 0.001, digits: 2, unit: "rad" },
  { param: "q2", label: "q₂", aria: "Elbow angle q2 in radians", min: 0, max: TAU, step: 0.001, digits: 2, unit: "rad" },
];

const LINK_SLIDERS: SliderSpec[] = [
  { param: "l1", label: "L₁", aria: "Length of link 1 in centimetres", min: MIN_LINK_CM, max: MAX_LINK_CM, step: 0.1, digits: 1, unit: "cm" },
  { param: "l2", label: "L₂", aria: "Length of link 2 in centimetres", min: MIN_LINK_CM, max: MAX_LINK_CM, step: 0.1, digits: 1, unit: "cm" },
];

const ALL_SLIDERS = [...ANGLE_SLIDERS, ...LINK_SLIDERS];

const CANVAS_DESCRIPTION =
  "A two-link robot arm seen from above. Link 1 turns about the base by the angle q1, " +
  "and link 2 turns about the elbow by the angle q2. The sliders beside the drawing " +
  "set both angles and both link lengths.";

/** The right-hand control panel and its live readouts. */
export function armControls(ctx: SceneContext) {
  const root = document.createElement("section");
  root.className = "ik-scene";
  root.innerHTML = `
    <header>
      <p class="ik-kicker">Forward kinematics</p>
      <h1>Two angles decide where the tip lands</h1>
      <p class="ik-lede">Drag the elbow or the tip in the drawing.</p>
    </header>
    <div class="ik-panel">
      <p class="ik-group">Joint angles</p>
      ${ANGLE_SLIDERS.map(sliderMarkup).join("")}
      <p class="ik-group">Link lengths</p>
      ${LINK_SLIDERS.map(sliderMarkup).join("")}
      <button type="button" class="ik-workspace" data-param="show.workspace" aria-pressed="false">Show reachable space</button>
      <p class="ik-area">
        <span class="ik-area-title">Reachable area <span class="ik-area-formula">= 4π L₁L₂</span></span>
        <output data-value="area"></output>
      </p>
      <div class="ik-plot">
        <svg viewBox="0 0 300 104" role="img" aria-label="The reachable area divided by the product of the two link lengths is four pi for every arm, so the plot is a flat horizontal line and both link markers sit on it.">
          <text class="ik-plot-tick" x="${PLOT.left - 4}" y="10" text-anchor="start">A \u00f7 (L\u2081L\u2082)</text>
          <line class="ik-plot-axis" x1="${PLOT.left}" y1="${PLOT.top}" x2="${PLOT.left}" y2="${PLOT.bottom}"></line>
          <line class="ik-plot-axis" x1="${PLOT.left}" y1="${PLOT.bottom}" x2="${PLOT.right}" y2="${PLOT.bottom}"></line>
          <line class="ik-plot-level" x1="${PLOT.left}" y1="${LEVEL_Y}" x2="${PLOT.right}" y2="${LEVEL_Y}"></line>
          <text class="ik-plot-level-label" x="${PLOT.left - 5}" y="${LEVEL_Y + 3}" text-anchor="end">4\u03c0</text>
          <text class="ik-plot-tick" x="${PLOT.left}" y="86" text-anchor="middle">0</text>
          <text class="ik-plot-tick" x="${PLOT.right}" y="86" text-anchor="middle">1</text>
          <text class="ik-plot-tick" x="${(PLOT.left + PLOT.right) / 2}" y="99" text-anchor="middle">link length \u00f7 longest link</text>
          <circle data-dot="l1" r="4.5" cy="${LEVEL_Y}"></circle>
          <circle data-dot="l2" r="4.5" cy="${LEVEL_Y}"></circle>
        </svg>
      </div>
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
  const areaValue = root.querySelector<HTMLOutputElement>(`[data-value="area"]`)!;
  const dots = new Map(
    (["l1", "l2"] as const).map((param) => [param, root.querySelector<SVGCircleElement>(`[data-dot="${param}"]`)!]),
  );

  const onSlider = (event: Event) => {
    const input = event.target as HTMLInputElement;
    ctx.write(input.dataset.param!, Number(input.value));
  };
  const onWorkspace = () => ctx.write("show.workspace", workspaceButton.getAttribute("aria-pressed") !== "true");
  for (const input of sliders.values()) input.addEventListener("input", onSlider);
  workspaceButton.addEventListener("click", onWorkspace);

  return {
    render(state: Readonly<PlainState>, activity: ParameterActivityMap) {
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
      const area = reachableArea(state.l1 as number, state.l2 as number);
      areaValue.textContent = `${area.toFixed(0)} cm² · ${(area / SQ_CM_PER_SQ_M).toFixed(4)} m²`;
      for (const [param, dot] of dots) dot.setAttribute("cx", String(plotX((state[param] as number) / MAX_LINK_CM)));
    },
    dispose() {
      for (const input of sliders.values()) input.removeEventListener("input", onSlider);
      workspaceButton.removeEventListener("click", onWorkspace);
      root.remove();
      style.remove();
      player.classList.remove("ik-player");
    },
  };
}

function sliderMarkup(spec: SliderSpec): string {
  return `<div class="ik-row" data-row="${spec.param}">
      <p class="ik-label"><span>${spec.label}</span><span data-value="${spec.param}"></span></p>
      <input type="range" data-param="${spec.param}" min="${spec.min}" max="${spec.max}" step="${spec.step}" aria-label="${spec.aria}">
    </div>`;
}

const STYLE = `
.ik-player { background: #f4f6f4; color: ${INK}; }
.ik-scene { font-family: system-ui, sans-serif; }
.ik-scene header { position: absolute; top: 5%; left: 4%; width: 54%; }
.ik-kicker { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${MUTED}; }
.ik-scene h1 { margin: 0; font-size: clamp(17px, 2.4vw, 29px); line-height: 1.15; font-weight: 600; }
.ik-lede { margin: 7px 0 0; font-size: 13px; line-height: 1.35; color: ${MUTED}; }
.ik-panel { position: absolute; top: 26%; right: 3%; bottom: 60px; display: flex; flex-direction: column; gap: 6px; width: 25%; overflow: hidden; pointer-events: auto; }
.ik-group { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${MUTED}; }
.ik-row { border-left: 3px solid transparent; padding-left: 7px; transition: border-color 160ms ease; }
.ik-row.ik-active { border-left-color: ${TIP}; }
.ik-label { display: flex; justify-content: space-between; gap: 8px; margin: 0; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ik-row input { display: block; box-sizing: border-box; width: 100%; height: 44px; margin: 0; accent-color: ${LINK1}; cursor: pointer; }
.ik-row input:focus-visible { outline: 3px solid ${TIP}; outline-offset: 2px; }
.ik-workspace { width: 100%; min-height: 44px; padding: 10px 12px; border: 1.5px solid ${WORKSPACE}; border-radius: 8px; background: transparent; color: ${WORKSPACE}; font: 600 14px system-ui, sans-serif; cursor: pointer; }
.ik-workspace:hover { background: rgba(31, 111, 139, 0.09); }
.ik-workspace:focus-visible { outline: 3px solid ${TIP}; outline-offset: 2px; }
.ik-workspace[aria-pressed="true"] { background: ${WORKSPACE}; color: #ffffff; }
.ik-workspace.ik-active { box-shadow: 0 0 0 3px rgba(181, 50, 43, 0.3); }
.ik-area { display: flex; flex-direction: column; gap: 2px; margin: 0; }
.ik-area-title { font-size: 12px; font-weight: 600; color: ${MUTED}; }
.ik-area-formula { font-weight: 400; }
.ik-area output { font: 700 16px/1.2 system-ui, sans-serif; font-variant-numeric: tabular-nums; color: ${WORKSPACE}; }
.ik-plot { flex: 1; min-height: 58px; }
.ik-plot svg { display: block; width: 100%; height: 100%; }
.ik-plot-axis { stroke: #c3cdd1; stroke-width: 1; }
.ik-plot-level { stroke: ${WORKSPACE}; stroke-width: 2; }
.ik-plot-tick { fill: ${MUTED}; font: 9px system-ui, sans-serif; }
.ik-plot-level-label { fill: ${WORKSPACE}; font: 700 9px system-ui, sans-serif; }
.ik-plot [data-dot="l1"] { fill: ${LINK1}; }
.ik-plot [data-dot="l2"] { fill: ${LINK2}; }
.ik-player .xv-board { top: 4%; right: 3%; width: 25%; height: 19%; padding: 0; font-size: 17px; }
.ik-player .xv-captions { color: ${INK}; text-shadow: none; }
@media (max-height: 500px) and (orientation: landscape) {
  .ik-scene header { width: 58%; }
  .ik-scene h1 { font-size: 16px; }
  .ik-panel { top: 22%; gap: 4px; }
  .ik-lede { display: none; }
  .ik-area output { font-size: 14px; }
  .ik-plot { min-height: 46px; }
  .ik-player .xv-board { font-size: 14px; }
}
`;
