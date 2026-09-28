// The IK teaser as a function of time. render.mjs calls renderAt(t) for every
// frame; everything on screen is computed from t alone, so any frame can be drawn
// on its own and the video is the same every time it is rendered.

// ---- Timeline: edit here -------------------------------------------------------
const FPS = 30;
const FADE = 10 / FPS; // crossfade between layers, in seconds
// Keep these multiples of 0.5 s so every cut lands on the music's beat (120 BPM).
const HOOK = 3.0; // the opening questions
const SHOT = 3.0; // each lesson shot
const END = 3.5; // the closing card
// The opening questions, one per line; the second is drawn in orange.
const QUESTION = ["How do we control a robot geometrically?", "And how do we make it move the right way?"];
// Each shot: the exported clip in clips/, where in it the shot starts (s), and the
// line it adds to "What you will learn".
const SHOTS = [
  { clip: "arm", trim: 0.7, learn: "How joint angles place the tip" },
  { clip: "elbow", trim: 4.5, learn: "Why a target might have multiple solutions" },
  { clip: "joints", trim: 1.0, learn: "What the six joints of the SO-101 robot do" },
  { clip: "teleop", trim: 1.0, learn: "How robots learn from demonstrations" },
  { clip: "brick", trim: 0.7, learn: "How the LeRobot library is used for imitation learning" },
];

// ---------------------------------------------------------------------------------

const TOTAL = HOOK + SHOTS.length * SHOT + END;
const END_AT = HOOK + SHOTS.length * SHOT;
// Where the lesson sits inside a 1920x1080 export; its dark page margins are cropped away.
const LESSON = { left: 58, width: 1804 };
const WINDOW_WIDTH = 1300;

/** What render.mjs needs: the clip frames each shot shows, and when the music's beat plays. */
window.TEASER = {
  fps: FPS,
  seconds: TOTAL,
  beat: { from: HOOK, to: END_AT },
  shots: SHOTS.map(({ clip, trim }) => ({ clip, trim, seconds: SHOT + FADE })),
};

// ---- Motion ---------------------------------------------------------------------

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const interpolate = (x, [x0, x1], [y0, y1]) => y0 + (y1 - y0) * clamp01((x - x0) / (x1 - x0));

/** A damped spring from 0 to 1, `frames` after it starts. */
function spring(frames, { damping = 20, stiffness = 100 } = {}) {
  const t = frames / FPS;
  if (t <= 0) return 0;
  const w = Math.sqrt(stiffness);
  const zeta = damping / (2 * w);
  if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const r1 = -w * (zeta - Math.sqrt(zeta * zeta - 1));
  const r2 = -w * (zeta + Math.sqrt(zeta * zeta - 1));
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

function rise(el, frame, delay, distance = 30) {
  const p = spring(frame - delay);
  el.style.opacity = p;
  el.style.transform = `translateY(${(1 - p) * distance}px)`;
}

// ---- The two-link arm on the cards ------------------------------------------------

const L1 = 0.25;
const L2 = 0.2;
const SVG = "http://www.w3.org/2000/svg";

function armPose(frame) {
  const t = frame / FPS;
  const q1 = 0.85 + 0.5 * Math.sin(t * 1.05);
  const q2 = -1.15 + 0.75 * Math.sin(t * 1.6 + 0.6);
  const elbow = { x: L1 * Math.cos(q1), y: -L1 * Math.sin(q1) };
  return { elbow, tip: { x: elbow.x + L2 * Math.cos(q1 + q2), y: elbow.y - L2 * Math.sin(q1 + q2) } };
}

function buildArm(svg) {
  const size = Number(svg.getAttribute("width"));
  const make = (tag, attrs) => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
    return el;
  };
  const c = size / 2;
  const ring = { fill: "none", stroke: "rgba(111,182,207,0.35)", "stroke-width": 2, "stroke-dasharray": "8 8" };
  make("circle", { ...ring, cx: c, cy: c, r: (L1 + L2) * size });
  make("circle", { ...ring, cx: c, cy: c, r: (L1 - L2) * size });
  return {
    size,
    trail: make("polyline", { fill: "none", stroke: "#b5322b", "stroke-opacity": 0.35, "stroke-width": 4, "stroke-linecap": "round" }),
    link1: make("line", { x1: c, y1: c, stroke: "#1f6f8b", "stroke-width": size * 0.035, "stroke-linecap": "round" }),
    link2: make("line", { stroke: "#c2622d", "stroke-width": size * 0.03, "stroke-linecap": "round" }),
    base: make("circle", { cx: c, cy: c, r: size * 0.028, fill: "#fff", stroke: "#1f6f8b", "stroke-width": 4 }),
    elbow: make("circle", { r: size * 0.022, fill: "#fff", stroke: "#1f6f8b", "stroke-width": 4 }),
    tip: make("circle", { r: size * 0.024, fill: "#b5322b" }),
  };
}

function drawArm(arm, frame) {
  const c = arm.size / 2;
  const X = (p) => c + p.x * arm.size;
  const Y = (p) => c + p.y * arm.size;
  const { elbow, tip } = armPose(frame);
  arm.trail.setAttribute("points", Array.from({ length: 36 }, (_, i) => armPose(frame - 35 + i).tip).map((p) => `${X(p)},${Y(p)}`).join(" "));
  arm.link1.setAttribute("x2", X(elbow));
  arm.link1.setAttribute("y2", Y(elbow));
  for (const [k, v] of Object.entries({ x1: X(elbow), y1: Y(elbow), x2: X(tip), y2: Y(tip) })) arm.link2.setAttribute(k, v);
  arm.elbow.setAttribute("cx", X(elbow));
  arm.elbow.setAttribute("cy", Y(elbow));
  arm.tip.setAttribute("cx", X(tip));
  arm.tip.setAttribute("cy", Y(tip));
}

// ---- Building the page once ---------------------------------------------------------

const hook = document.getElementById("hook");
const end = document.getElementById("end");
const learn = document.getElementById("learn");
const arms = [...document.querySelectorAll("svg.arm")].map(buildArm);

const words = QUESTION.map((line, n) => {
  const el = document.getElementById(`line${n + 1}`);
  return line.split(" ").map((word) => {
    const span = document.createElement("span");
    span.textContent = word;
    if (n === 1) span.style.color = "var(--orange)";
    el.append(span);
    return span;
  });
});

const shots = SHOTS.map(() => {
  const layer = document.createElement("div");
  layer.className = "layer";
  layer.innerHTML = `<div class="window"><div class="zoom"><img></div></div>`;
  const img = layer.querySelector("img");
  const scale = WINDOW_WIDTH / LESSON.width;
  Object.assign(img.style, { left: `${-LESSON.left * scale}px`, top: "0px", width: `${1920 * scale}px`, height: `${1080 * scale}px` });
  document.getElementById("shots").append(layer);
  return { layer, img, zoom: layer.querySelector(".zoom") };
});

const items = SHOTS.map(({ learn: text }, i) => {
  const item = document.createElement("div");
  item.className = "item";
  item.innerHTML = `<div class="badge"></div><div class="label"></div>`;
  item.querySelector(".label").textContent = text;
  document.getElementById("items").append(item);
  return { item, badge: item.querySelector(".badge"), number: i + 1 };
});

// ---- One frame ----------------------------------------------------------------------

/** Show a layer from `start` for `length` seconds, fading in over FADE unless it opens the video. */
function layerAt(el, t, start, length, fadeIn = true) {
  const visible = t >= start && t < start + length;
  el.style.display = visible ? "block" : "none";
  el.style.opacity = !visible ? 0 : fadeIn ? clamp01((t - start) / FADE) : 1;
  return visible;
}

window.renderAt = async function renderAt(t) {
  await document.fonts.ready;
  const frame = Math.round(t * FPS);
  const pending = [];

  if (layerAt(hook, t, 0, HOOK + FADE, false)) {
    hook.style.display = "flex";
    hook.querySelector(".kicker").style.opacity = interpolate(frame, [0, 12], [0, 1]);
    words.forEach((line, n) => line.forEach((span, i) => {
      const p = spring(frame - (n === 0 ? 2 : 4 + words[0].length * 2) - i * 2, { damping: 16, stiffness: 170 });
      span.style.opacity = p;
      span.style.transform = `translateY(${(1 - p) * 40}px)`;
    }));
    drawArm(arms[0], frame);
  }

  shots.forEach((shot, i) => {
    const start = HOOK + i * SHOT;
    if (!layerAt(shot.layer, t, start, SHOT + FADE)) return;
    const local = Math.round((t - start) * FPS);
    shot.zoom.style.transform = `scale(${interpolate(local, [0, (SHOT + FADE) * FPS], [1, 1.06])})`;
    const src = `frames/${SHOTS[i].clip}/${String(local + 1).padStart(4, "0")}.jpg`;
    if (!shot.img.src.endsWith(src)) {
      shot.img.src = src;
      pending.push(shot.img.decode());
    }
  });

  if (layerAt(learn, t, HOOK, SHOTS.length * SHOT + FADE, false)) {
    const local = Math.round((t - HOOK) * FPS);
    learn.style.opacity = interpolate(local, [SHOTS.length * SHOT * FPS, (SHOTS.length * SHOT + FADE) * FPS], [1, 0]);
    learn.querySelector(".header").style.opacity = spring(local);
    const current = Math.min(SHOTS.length - 1, Math.floor((t - HOOK) / SHOT));
    items.forEach(({ item, badge, number }, i) => {
      const since = local - Math.round(i * SHOT * FPS);
      item.style.display = since >= 0 ? "flex" : "none";
      if (since < 0) return;
      const p = spring(since, { damping: 18 });
      item.style.opacity = p;
      item.style.transform = `translateX(${(1 - p) * 40}px)`;
      item.classList.toggle("active", i === current);
      badge.textContent = i === current ? number : "✓";
    });
  }

  if (layerAt(end, t, END_AT, END + 1)) {
    end.style.display = "flex";
    const local = Math.round((t - END_AT) * FPS);
    for (const el of end.querySelectorAll("[data-rise]")) rise(el, local, Number(el.dataset.rise));
    drawArm(arms[1], frame);
  }

  await Promise.all(pending);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};
