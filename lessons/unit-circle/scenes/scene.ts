import type { Handle, Schema } from "@tangible/core";
import type { SceneContext, SceneModule } from "@tangible/player";
import { angleControls, INK, line, plotBounds, RED, TEAL, TAU } from "./controls.js";

export const schema: Schema = {
  theta: { type: { kind: "scalar", range: [0, 6.2832] }, default: 0, interpolate: "lerp", ownership: "script", label: "angle on the circle, in radians" },
  "show.projection": { type: { kind: "boolean" }, default: true, interpolate: "snap", ownership: "script" },
  "show.thetaLabel": { type: { kind: "boolean" }, default: true, interpolate: "snap", ownership: "script" },
  "show.cosLabel": { type: { kind: "boolean" }, default: true, interpolate: "snap", ownership: "script" },
};

export const constants = { HALF_PI: Math.PI / 2, PI: Math.PI, TWO_PI: TAU };

/** Cartesian coordinates on the unit circle, with the vertical axis pointing up. */
export function pointOnCircle(theta: number) {
  return { x: Math.cos(theta), y: Math.sin(theta) };
}

export function circleGeometry(ctx: SceneContext) {
  const box = plotBounds(ctx);
  return { cx: (box.left + box.right) / 2, cy: (box.top + box.bottom) / 2, radius: Math.min((box.right - box.left) * 0.4, (box.bottom - box.top) * 0.45), scale: box.scale };
}

export const scene: SceneModule = {
  schema, constants,
  create(ctx) {
    const g = ctx.canvas.getContext("2d")!;
    const controls = angleControls(ctx, "The unit circle", "A point on the unit circle and its horizontal coordinate, cosine. The angle slider provides keyboard control.");
    return {
      render(state) {
        const theta = Number(state.theta);
        const { cx, cy, radius: r, scale } = circleGeometry(ctx);
        const { x, y } = pointOnCircle(theta);
        const px = cx + r * x, py = cy - r * y;
        g.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        g.strokeStyle = "#bbc6bf"; g.lineWidth = scale;
        line(g, cx - r * 1.2, cy, cx + r * 1.2, cy);
        line(g, cx, cy - r * 1.15, cx, cy + r * 1.15);
        g.strokeStyle = INK; g.lineWidth = 2 * scale;
        g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
        line(g, cx, cy, px, py);
        if (state["show.projection"]) {
          g.strokeStyle = TEAL; g.setLineDash([4 * scale, 4 * scale]);
          line(g, px, py, px, cy); g.setLineDash([]);
          g.lineWidth = 5 * scale; line(g, cx, cy, px, cy);
        }
        g.fillStyle = RED; g.beginPath(); g.arc(px, py, 7 * scale, 0, TAU); g.fill();
        g.fillStyle = INK; g.font = `${15 * scale}px system-ui`; g.textAlign = "center";
        if (state["show.thetaLabel"]) g.fillText("θ", cx + r * 0.3 * Math.cos(theta / 2), cy - r * 0.3 * Math.sin(theta / 2));
        if (state["show.cosLabel"]) { g.fillStyle = TEAL; g.fillText("cos θ", (cx + px) / 2, cy + 23 * scale); }
        g.fillStyle = INK; g.fillText("1", cx + r * 1.15, cy - 8 * scale);
        controls.render(theta);
      },
      handles: () => [pointHandle(ctx)],
      dispose: () => controls.dispose(),
    };
  },
};

function pointHandle(ctx: SceneContext): Handle {
  return {
    id: "point", params: ["theta"],
    hitTest(px, py, state) {
      const { cx, cy, radius, scale } = circleGeometry(ctx);
      const { x, y } = pointOnCircle(Number(state.theta));
      return Math.hypot(px - cx - x * radius, py - cy + y * radius) <= 22 * scale;
    },
    onDrag(px, py) {
      const { cx, cy } = circleGeometry(ctx);
      return { theta: (Math.atan2(cy - py, px - cx) + TAU) % TAU };
    },
  };
}
