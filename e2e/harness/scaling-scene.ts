import type { SceneModule } from "@tangible/player";
import { scene as circle } from "../fixtures/unit-circle/scenes/scene";

/** Exercise canvas marks, HTML alignment, native controls, and pointer conversion together. */
export const scalingScene: SceneModule = {
  schema: circle.schema,
  designSize: { width: 1280, height: 720 },
  create(ctx) {
    const drawing = ctx.canvas.getContext("2d")!;
    const label = document.createElement("label");
    label.className = "scaling-label";
    label.style.cssText = "position:absolute;left:100px;top:100px;font:16px system-ui;pointer-events:auto";
    label.innerHTML = 'Position <input aria-label="Point position" type="range" min="0" max="6.28" step="0.01" style="display:block;width:160px;height:44px;margin:0">';
    const input = label.querySelector("input")!;
    input.oninput = () => ctx.write("theta", Number(input.value));
    ctx.overlay.append(label);
    return {
      render(state) {
        const size = ctx.size();
        drawing.setTransform(size.canvasScale, 0, 0, size.canvasScale, 0, 0);
        drawing.clearRect(0, 0, size.width, size.height);
        drawing.fillStyle = "#174f9a";
        drawing.fillRect(100, 200, 160, 2);
        drawing.beginPath();
        drawing.arc(100 + Number(state.theta) * 40, 260, 5, 0, 2 * Math.PI);
        drawing.fill();
        input.value = String(state.theta);
        ctx.canvas.dataset.size = JSON.stringify(size);
      },
      handles: () => [{
        id: "theta", params: ["theta"],
        hitTest: (x, y) => Math.abs(y / ctx.size().canvasScale - 260) <= 22 && x / ctx.size().canvasScale >= 78,
        onDrag: x => ({ theta: (x / ctx.size().canvasScale - 100) / 40 }),
      }],
      dispose: () => label.remove(),
    };
  },
};
