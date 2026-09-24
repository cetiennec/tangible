// How much of its reach the arm can actually get to, as a surface over the two
// link lengths, drawn as an isometric wireframe. Plain area is not the right
// quantity here: it simply grows with both links and never peaks. Coverage does
// peak, and it peaks exactly where the links are equal, which is the claim the
// narration makes.

import { FREE_ELBOW, MAX_LINK_CM, MIN_LINK_CM, reachCoverage } from "./kinematics.js";

export interface SurfaceBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const DIVISIONS = 12;

/** A link length expressed as a fraction of the slider's range. */
export function linkFraction(cm: number): number {
  return (cm - MIN_LINK_CM) / (MAX_LINK_CM - MIN_LINK_CM);
}

function linkAt(fraction: number): number {
  return MIN_LINK_CM + fraction * (MAX_LINK_CM - MIN_LINK_CM);
}

// How far the view is turned around the vertical axis. At zero the viewer looks
// straight along the diagonal, so the ridge collapses to a short vertical stick.
const VIEW_TURN = (30 * Math.PI) / 180;
/** How many times faster the drawn surface falls away from its ridge than coverage does. */
const SLOPE_STRETCH = 2;

/** Isometric projection: u runs along link 1, v along link 2, z is the area. */
export function projectSurface(box: SurfaceBox, u: number, v: number, z: number) {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  // Turn the square of link lengths about its centre before projecting it.
  const [cu, cv] = [u - 0.5, v - 0.5];
  const tu = 0.5 + cu * Math.cos(VIEW_TURN) - cv * Math.sin(VIEW_TURN);
  const tv = 0.5 + cu * Math.sin(VIEW_TURN) + cv * Math.cos(VIEW_TURN);
  return {
    x: (box.left + box.right) / 2 + (tu - tv) * width * 0.44,
    y: box.bottom - height * 0.1 - (tu + tv) * height * 0.15 - z * height * 0.46,
  };
}

/**
 * Height of the surface: the fraction of its reach the arm can get to. The
 * elbow is taken as free here, because the narration reaches this picture
 * before joint limits are introduced; equal links then leave no blind spot at
 * all, and the surface touches its ceiling along the diagonal.
 */
function heightAt(u: number, v: number): number {
  // Over the slider range coverage only falls from 100% to 64%, which draws as
  // a nearly flat sheet. Stretch the fall-off below the ridge so the crest
  // reads; the marker still states the true percentage.
  return Math.max(0, 1 - SLOPE_STRETCH * (1 - reachCoverage(linkAt(u), linkAt(v), FREE_ELBOW)));
}

function point(box: SurfaceBox, u: number, v: number) {
  return projectSurface(box, u, v, heightAt(u, v));
}

export function drawAreaSurface(
  g: CanvasRenderingContext2D,
  box: SurfaceBox,
  l1: number,
  l2: number,
  colors: { ink: string; muted: string; allowed: string; ridge: string; marker: string },
) {
  g.save();
  drawBasePlane(g, box, colors);

  for (let i = 0; i <= DIVISIONS; i += 1) {
    const t = i / DIVISIONS;
    strokeCurve(g, box, (s) => [t, s], colors);
    strokeCurve(g, box, (s) => [s, t], colors);
  }

  // The diagonal where the two links are equal: the crest of the surface.
  g.strokeStyle = colors.ridge;
  g.lineWidth = 2.5;
  g.beginPath();
  for (let i = 0; i <= DIVISIONS * 4; i += 1) {
    const t = i / (DIVISIONS * 4);
    const p = point(box, t, t);
    if (i === 0) g.moveTo(p.x, p.y);
    else g.lineTo(p.x, p.y);
  }
  g.stroke();

  drawMarker(g, box, l1, l2, colors);
  drawLabels(g, box, colors);
  g.restore();
}

/** The flat square of link-length combinations the surface sits above. */
function drawBasePlane(g: CanvasRenderingContext2D, box: SurfaceBox, colors: { muted: string }) {
  g.strokeStyle = colors.muted;
  g.globalAlpha = 0.45;
  g.lineWidth = 1;
  g.beginPath();
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
    const p = projectSurface(box, u, v, 0);
    if (u === 0 && v === 0) g.moveTo(p.x, p.y);
    else g.lineTo(p.x, p.y);
  }
  g.closePath();
  g.stroke();
  g.globalAlpha = 1;
}

function strokeCurve(
  g: CanvasRenderingContext2D,
  box: SurfaceBox,
  at: (s: number) => [number, number],
  colors: { allowed: string },
) {
  const steps = DIVISIONS * 3;
  let previousAllowed: boolean | undefined;
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const [u, v] = at(i / steps);
    const p = point(box, u, v);
    if (previousAllowed === undefined) {
      g.strokeStyle = colors.allowed;
      g.globalAlpha = 0.8;
      g.beginPath();
      g.moveTo(p.x, p.y);
      previousAllowed = true;
    } else {
      g.lineTo(p.x, p.y);
    }
  }
  g.stroke();
  g.globalAlpha = 1;
}

/** Where the current pair of link lengths sits on the surface. */
function drawMarker(
  g: CanvasRenderingContext2D,
  box: SurfaceBox,
  l1: number,
  l2: number,
  colors: { marker: string; ink: string },
) {
  const [u, v] = [linkFraction(l1), linkFraction(l2)];
  const top = point(box, u, v);
  const base = projectSurface(box, u, v, 0);
  g.strokeStyle = colors.marker;
  g.globalAlpha = 0.5;
  g.setLineDash([3, 3]);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(base.x, base.y);
  g.lineTo(top.x, top.y);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
  g.fillStyle = colors.marker;
  g.beginPath();
  g.arc(top.x, top.y, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = colors.ink;
  g.font = "700 12px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText(`${Math.round(reachCoverage(l1, l2, FREE_ELBOW) * 100)}% reached`, top.x, top.y - 12);
}

function drawLabels(g: CanvasRenderingContext2D, box: SurfaceBox, colors: { ink: string; muted: string; ridge: string }) {
  // Name the plot: the narration calls it a surface plot, and without a title
  // it reads as the reachable area, which is a different quantity.
  g.font = "700 15px system-ui, sans-serif";
  g.fillStyle = colors.ink;
  g.textAlign = "left";
  g.fillText("Coverage surface", box.left, box.top - 8);
  g.font = "600 12px system-ui, sans-serif";
  g.fillStyle = colors.muted;
  g.textAlign = "center";
  const l1End = projectSurface(box, 1, 0, 0);
  const l2End = projectSurface(box, 0, 1, 0);
  g.fillText("L₁", l1End.x + 16, l1End.y + 6);
  g.fillText("L₂", l2End.x - 16, l2End.y + 6);
  g.textAlign = "left";
  g.fillText("share of its reach", box.left, box.top + 12);
  g.fillStyle = colors.ridge;
  g.fillText("L₁ = L₂", box.left, box.top + 28);
}
