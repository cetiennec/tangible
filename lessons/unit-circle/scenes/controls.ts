import type { SceneContext } from "@tangible/player";

export const TAU = Math.PI * 2;
export const INK = "#243d45";
export const RED = "#c64d37";
export const TEAL = "#27766d";

/** Shared controls for the two representations of cosine. */
export function angleControls(ctx: SceneContext, title: string, description: string) {
  const root = document.createElement("section");
  root.className = "trig-scene";
  root.innerHTML = `<header><p>ANGLES & COSINE</p><h1></h1></header>
    <div class="trig-controls"><label>Angle θ<input type="range" min="0" max="${TAU}" step="0.001" aria-label="Angle theta"></label>
    <output></output><p>Drag the point or move the slider.</p></div>`;
  root.querySelector("h1")!.textContent = title;
  const slider = root.querySelector("input")!;
  const output = root.querySelector("output")!;
  const write = () => ctx.write("theta", Number(slider.value));
  slider.addEventListener("input", write);
  const style = document.createElement("style");
  style.textContent = STYLE;
  const player = ctx.overlay.parentElement!;
  player.classList.add("trig-player");
  ctx.canvas.setAttribute("role", "img");
  ctx.canvas.setAttribute("aria-label", description);
  ctx.overlay.append(style, root);
  return {
    render(theta: number) {
      slider.value = String(theta);
      output.textContent = `${Math.round(theta * 180 / Math.PI)}° · cos θ = ${Math.cos(theta).toFixed(2)}`;
    },
    dispose() {
      slider.removeEventListener("input", write);
      root.remove(); style.remove(); player.classList.remove("trig-player");
    },
  };
}

/** Plot bounds in canvas pixels, with room for the heading, board and captions. */
export function plotBounds(ctx: SceneContext) {
  const { width, height } = ctx.viewport();
  const scale = width / (ctx.canvas.getBoundingClientRect().width || width);
  return { left: width * 0.09, right: width * 0.65, top: height * 0.23, bottom: height - 146 * scale, scale };
}

export function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}

const STYLE = `
.trig-player { background: #f6f4ed; color: #243d45; }
.trig-scene { font-family: system-ui, sans-serif; }
.trig-scene header { position: absolute; top: 5%; left: 5%; width: 62%; }
.trig-scene header p { margin: 0 0 5px; font-size: 11px; letter-spacing: .13em; color: #596f70; }
.trig-scene h1 { margin: 0; font-size: clamp(18px, 2.5vw, 30px); line-height: 1.15; font-weight: 600; }
.trig-controls { position: absolute; top: 48%; right: 4%; width: 23%; pointer-events: auto; }
.trig-controls label { display: block; font-size: 15px; font-weight: 600; }
.trig-controls input { display: block; box-sizing: border-box; width: 100%; height: 44px; margin: 0; accent-color: #c64d37; }
.trig-controls output { display: block; font-size: 13px; font-variant-numeric: tabular-nums; }
.trig-controls p { font-size: 12px; line-height: 1.4; color: #596f70; }
.trig-player .xv-board { top: 23%; right: 3%; width: 25%; height: 22%; padding: 8px; font-size: 18px; }
.trig-player .xv-captions { color: #243d45; text-shadow: none; }
@media (max-height: 500px) { .trig-controls p { display: none; } .trig-player .xv-board { font-size: 15px; } }
`;
