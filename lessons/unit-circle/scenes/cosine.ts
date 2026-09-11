import type { Schema } from "@tangible/core";
import type { SceneContext, SceneModule } from "@tangible/player";
import { angleControls, INK, line, plotBounds, RED, TEAL, TAU } from "./controls.js";

export const schema: Schema = {
  theta: { type: { kind: "scalar", range: [0, 6.2832] }, default: 0, interpolate: "lerp", ownership: "script", label: "angle along the graph's horizontal axis, in radians" },
};
export const constants = { HALF_PI: Math.PI / 2, PI: Math.PI, TWO_PI: TAU };

export function graphGeometry(ctx: SceneContext) {
  const box = plotBounds(ctx);
  const cy = (box.top + box.bottom) / 2;
  const amplitude = (box.bottom - box.top) * 0.4;
  return { ...box, cy, amplitude, x: (theta: number) => box.left + theta / TAU * (box.right - box.left), y: (theta: number) => cy - Math.cos(theta) * amplitude };
}

export const scene: SceneModule = {
  schema, constants,
  create(ctx) {
    const g = ctx.canvas.getContext("2d")!;
    const controls = angleControls(ctx, "Cosine as a graph", "A cosine curve from zero to one full turn, with a movable point. The angle slider provides keyboard control.");
    return {
      render(state) {
        const theta = Number(state.theta);
        const box = graphGeometry(ctx), { scale } = box;
        g.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        g.lineWidth = scale; g.strokeStyle = "#d6ddd4";
        for (const v of [-1, 1]) line(g, box.left, box.cy - v * box.amplitude, box.right, box.cy - v * box.amplitude);
        g.strokeStyle = "#8a9d97";
        line(g, box.left, box.cy, box.right + 12 * scale, box.cy);
        line(g, box.left, box.top, box.left, box.bottom);
        g.font = `${13 * scale}px system-ui`; g.fillStyle = INK; g.textAlign = "center";
        for (const [angle, label] of [[0, "0"], [Math.PI / 2, "π/2"], [Math.PI, "π"], [Math.PI * 1.5, "3π/2"], [TAU, "2π"]] as const) {
          const x = box.x(angle);
          line(g, x, box.cy - 3 * scale, x, box.cy + 3 * scale);
          g.fillText(label, x, box.bottom + 17 * scale);
        }
        g.textAlign = "right";
        g.fillText("1", box.left - 9 * scale, box.cy - box.amplitude + 4 * scale);
        g.fillText("−1", box.left - 9 * scale, box.cy + box.amplitude + 4 * scale);
        g.strokeStyle = TEAL; g.lineWidth = 3 * scale; g.beginPath();
        for (let i = 0; i <= 160; i++) {
          const a = TAU * i / 160;
          if (i === 0) g.moveTo(box.x(a), box.y(a)); else g.lineTo(box.x(a), box.y(a));
        }
        g.stroke();
        g.strokeStyle = RED; g.lineWidth = scale; g.setLineDash([4 * scale, 4 * scale]);
        line(g, box.x(theta), box.y(theta), box.x(theta), box.cy); g.setLineDash([]);
        g.fillStyle = RED; g.beginPath(); g.arc(box.x(theta), box.y(theta), 7 * scale, 0, TAU); g.fill();
        controls.render(theta);
      },
      handles: () => [{
        id: "point", params: ["theta"],
        hitTest(x, y, state) {
          const box = graphGeometry(ctx);
          return Math.hypot(x - box.x(Number(state.theta)), y - box.y(Number(state.theta))) <= 22 * box.scale;
        },
        onDrag(x) {
          const box = graphGeometry(ctx);
          return { theta: Math.max(0, Math.min(TAU, (x - box.left) / (box.right - box.left) * TAU)) };
        },
      }],
      dispose: () => controls.dispose(),
    };
  },
};
