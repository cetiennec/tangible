// The scene itself needs a WebGL context, which jsdom does not provide, so the
// tests cover the parts that decide whether the arm assembles correctly: the
// rotation convention, and the joint ranges declared against the real robot.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { rpyQuaternion } from "./so101-view.js";
import { schema } from "./so101.js";

const HALF_PI = Math.PI / 2;

function turn(rpy: [number, number, number], point: [number, number, number]) {
  return new THREE.Vector3(...point).applyQuaternion(rpyQuaternion(rpy));
}

describe("the URDF rotation convention", () => {
  it("turns about z for yaw", () => {
    const v = turn([0, 0, HALF_PI], [1, 0, 0]);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(1, 9);
  });

  it("turns about y for pitch", () => {
    const v = turn([0, HALF_PI, 0], [0, 0, 1]);
    expect(v.x).toBeCloseTo(1, 9);
    expect(v.z).toBeCloseTo(0, 9);
  });

  it("turns about x for roll", () => {
    const v = turn([HALF_PI, 0, 0], [0, 1, 0]);
    expect(v.y).toBeCloseTo(0, 9);
    expect(v.z).toBeCloseTo(1, 9);
  });

  it("composes roll, then pitch, then yaw, as URDF specifies", () => {
    // Rz(90) * Rx(90) applied to the y axis leaves it on z.
    const v = turn([HALF_PI, 0, HALF_PI], [0, 1, 0]);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(0, 9);
    expect(v.z).toBeCloseTo(1, 9);
  });

  it("is a pure rotation, preserving length", () => {
    expect(turn([0.3, -1.1, 2.2], [0.4, -0.7, 0.55]).length()).toBeCloseTo(Math.hypot(0.4, 0.7, 0.55), 9);
  });
});

describe("the SO-101 scene contract", () => {
  it("exposes one parameter per moving joint, plus the camera and the note", () => {
    expect(Object.keys(schema).sort()).toEqual(
      ["camera", "elbow", "gripper", "lift", "pan", "show.leader", "teleop", "wristFlex", "wristRoll"].sort(),
    );
  });

  it("uses the joint limits the published description declares", () => {
    const range = (name: string) => (schema[name]!.type as { range: [number, number] }).range;
    expect(range("pan")).toEqual([-1.91986, 1.91986]);
    expect(range("lift")).toEqual([-1.74533, 1.74533]);
    expect(range("elbow")).toEqual([-1.69, 1.69]);
    expect(range("gripper")).toEqual([-0.17453, 1.74533]);
  });

  it("starts every joint at zero and lets the viewer keep the camera they choose", () => {
    for (const name of ["pan", "lift", "elbow", "wristFlex", "wristRoll", "gripper"]) {
      expect(schema[name]!.default).toBe(0);
      expect(schema[name]!.ownership).toBe("script");
    }
    expect(schema["camera"]!.ownership).toBe("viewer");
    expect(schema["camera"]!.interpolate).toBe("orbit");
  });

  it("has no separate joint parameters for the leader arm", () => {
    // Both arms are driven by the same six numbers, which is the point being
    // made: the follower copies the leader's joint angles directly.
    const jointish = Object.keys(schema).filter((k) => !["camera", "teleop", "show.leader"].includes(k));
    expect(jointish).toHaveLength(6);
    expect(jointish.some((k) => k.toLowerCase().includes("leader"))).toBe(false);
  });

  it("keeps the second arm hidden until the narration asks for it", () => {
    expect(schema["show.leader"]!.default).toBe(false);
    expect(schema["show.leader"]!.interpolate).toBe("snap");
  });
});
