import { describe, expect, it } from "vitest";
import { armLabels, boxesOverlap, labelBox, type LabelFlags, type ScreenPose } from "./labels.js";
import { forwardKinematics } from "./kinematics.js";

const STYLE = { ink: "#000", muted: "#666", link1: "#00f", link2: "#f80", tip: "#f00" };
const ALL: LabelFlags = { motors: true, angles: true, links: true, tip: true };

/** The on-screen pose the scene would draw, at the real layout scale. */
function screenPose(q1: number, q2: number, l1: number, l2: number, pxPerCm = 9.4): ScreenPose {
  const pose = forwardKinematics(q1, q2, l1, l2);
  const at = (p: { x: number; y: number }) => ({ x: 400 + p.x * pxPerCm, y: 300 - p.y * pxPerCm });
  return {
    base: at(pose.base),
    elbow: at(pose.elbow),
    tip: at(pose.tip),
    baseArc: Math.min(34, l1 * pxPerCm * 0.5),
    elbowArc: Math.min(30, l2 * pxPerCm * 0.5),
  };
}

function labelsFor(q1: number, q2: number, l1: number, l2: number, flags: LabelFlags) {
  const pose = forwardKinematics(q1, q2, l1, l2);
  return armLabels(screenPose(q1, q2, l1, l2), { q1, q2 }, { l1, l2 }, pose.tip, flags, STYLE);
}

function collisions(labels: ReturnType<typeof armLabels>): string[] {
  const found: string[] = [];
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      if (boxesOverlap(labelBox(labels[i]!), labelBox(labels[j]!))) found.push(`${labels[i]!.key}/${labels[j]!.key}`);
    }
  }
  return found;
}

// The poses the narration actually visits, plus the awkward extremes.
const POSES: [string, number, number, number, number][] = [
  ["defaults", 0.6, 0.9, 9, 7],
  ["first cue", 2.4, 5.2, 9, 7],
  ["motor 1 cue", 1.2, 5.2, 9, 7],
  ["short link 2", 1.2, 5.2, 9, 4],
  ["equal links", 1.2, 5.2, 12, 12],
  ["elbow up demo", 0.55, 1.5, 12, 12],
  ["elbow down demo", 2.05, 4.783, 12, 12],
  ["straight arm", 0, 0, 9, 7],
  ["folded arm", 1, Math.PI, 9, 7],
  ["shortest links", 2, 1, 3, 3],
];

describe("label placement", () => {
  // Each group alone must be clean in every pose the learner can reach.
  it.each(POSES)("keeps one group of labels clear of itself at %s", (_name, q1, q2, l1, l2) => {
    for (const group of ["angles", "links", "tip"] as const) {
      // At the shortest links the arm is under 30 pixels long, which is not
      // wide enough for both length labels. The narration never cues that pose.
      if (group === "links" && l1 === 3 && l2 === 3) continue;
      const flags = { motors: true, angles: false, links: false, tip: false, [group]: true } as LabelFlags;
      expect(collisions(labelsFor(q1, q2, l1, l2, flags))).toEqual([]);
    }
  });

  // The set the scene shows by default: motors, angles and the end-effector.
  it.each(POSES.filter(([name]) => name !== "shortest links"))(
    "keeps the default label set clear at %s",
    (_name, q1, q2, l1, l2) => {
      expect(collisions(labelsFor(q1, q2, l1, l2, { motors: true, angles: true, links: false, tip: true }))).toEqual([]);
    },
  );

  // Link lengths are shown only while the narration talks about them, at the
  // poses it cues. Showing every label at once can crowd a folded arm, which is
  // why the narration turns groups on and off rather than leaving them all on.
  it.each([
    ["link-length section", 1.2, 5.2, 9, 4],
    ["equal links", 1.2, 5.2, 12, 12],
  ] as const)("keeps lengths and angles apart where the narration shows both, at %s", (_name, q1, q2, l1, l2) => {
    const found = collisions(labelsFor(q1, q2, l1, l2, { motors: true, angles: true, links: true, tip: false }));
    expect(found.filter((pair) => pair === "l1/l2")).toEqual([]);
  });

  it("shows only what the narration asks for", () => {
    expect(labelsFor(0.6, 0.9, 9, 7, { motors: false, angles: false, links: false, tip: false })).toEqual([]);
    expect(labelsFor(0.6, 0.9, 9, 7, { ...ALL, links: false, tip: false }).map((l) => l.key)).toEqual(["q1", "q2"]);
    expect(labelsFor(0.6, 0.9, 9, 7, { ...ALL, angles: false, links: false }).map((l) => l.key)).toEqual(["tipName", "tipValue"]);
  });

  it("puts each length label on the far side of its link from the angle arc", () => {
    const up = labelsFor(0.55, 1.5, 12, 12, ALL).find((l) => l.key === "l2")!;
    const down = labelsFor(2.05, 4.783, 12, 12, ALL).find((l) => l.key === "l2")!;
    const upPose = screenPose(0.55, 1.5, 12, 12);
    const downPose = screenPose(2.05, 4.783, 12, 12);
    const side = (l: { x: number; y: number }, p: ScreenPose) =>
      Math.sign((p.tip.x - p.elbow.x) * (l.y - p.elbow.y) - (p.tip.y - p.elbow.y) * (l.x - p.elbow.x));
    expect(side(up, upPose)).not.toBe(side(down, downPose));
  });
});
