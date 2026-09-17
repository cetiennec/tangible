// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { movingJoints, parseUrdf } from "./urdf.js";

// Shaped exactly like the SO-101 description, trimmed to two joints.
const SAMPLE = `<?xml version="1.0"?>
<robot name="so101_new_calib">
  <material name="3d_printed"><color rgba="1.0 0.82 0.12 1.0"/></material>
  <material name="sts3215"><color rgba="0.1 0.1 0.1 1.0"/></material>
  <link name="base_link">
    <inertial><mass value="0.147"/></inertial>
    <visual>
      <origin xyz="0.0 0.1 0.2" rpy="0 0 1.5708"/>
      <geometry><mesh filename="assets/base_so101_v2.stl"/></geometry>
      <material name="3d_printed"/>
    </visual>
    <collision><geometry><mesh filename="assets/base_so101_v2.stl"/></geometry></collision>
  </link>
  <link name="shoulder_link">
    <visual>
      <origin xyz="-0.03 0 0.05" rpy="0 -1.5708 0"/>
      <geometry><mesh filename="assets/sts3215_03a_v1.stl"/></geometry>
      <material name="sts3215"/>
    </visual>
  </link>
  <link name="upper_arm_link"/>
  <joint name="shoulder_pan" type="revolute">
    <origin xyz="0 0 0.0542" rpy="0 0 0"/>
    <parent link="base_link"/><child link="shoulder_link"/>
    <axis xyz="0 0 1"/>
    <limit effort="10" velocity="10" lower="-1.91986" upper="1.91986"/>
  </joint>
  <joint name="shoulder_lift" type="revolute">
    <origin xyz="-0.0304 -0.0183 -0.0542" rpy="-1.5708 -1.5708 0"/>
    <parent link="shoulder_link"/><child link="upper_arm_link"/>
    <axis xyz="0 0 1"/>
    <limit lower="-1.74533" upper="1.74533"/>
  </joint>
  <joint name="fixed_frame" type="fixed">
    <origin xyz="0 0 0" rpy="0 0 0"/>
    <parent link="upper_arm_link"/><child link="shoulder_link"/>
  </joint>
</robot>`;

describe("reading the robot description", () => {
  const robot = parseUrdf(SAMPLE);

  it("names the robot and finds every link", () => {
    expect(robot.name).toBe("so101_new_calib");
    expect(robot.links.map((l) => l.name)).toEqual(["base_link", "shoulder_link", "upper_arm_link"]);
  });

  it("reads visual meshes with their placement, ignoring collision shapes", () => {
    const base = robot.links[0]!;
    expect(base.visuals).toHaveLength(1);
    expect(base.visuals[0]!.mesh).toBe("assets/base_so101_v2.stl");
    expect(base.visuals[0]!.xyz).toEqual([0, 0.1, 0.2]);
    expect(base.visuals[0]!.rpy[2]).toBeCloseTo(1.5708, 6);
    expect(base.visuals[0]!.material).toBe("3d_printed");
  });

  it("reads each joint's placement, axis and limits", () => {
    const lift = robot.joints.find((j) => j.name === "shoulder_lift")!;
    expect(lift.type).toBe("revolute");
    expect(lift.parent).toBe("shoulder_link");
    expect(lift.child).toBe("upper_arm_link");
    expect(lift.axis).toEqual([0, 0, 1]);
    expect(lift.lower).toBeCloseTo(-1.74533, 6);
    expect(lift.upper).toBeCloseTo(1.74533, 6);
    expect(lift.rpy[0]).toBeCloseTo(-1.5708, 6);
  });

  it("reads the material colours", () => {
    expect(robot.materials["sts3215"]).toEqual([0.1, 0.1, 0.1]);
    expect(robot.materials["3d_printed"]![0]).toBeCloseTo(1, 6);
  });

  it("finds the link that nothing else hangs from", () => {
    expect(robot.root).toBe("base_link");
  });

  it("lists only the joints that actually move", () => {
    expect(movingJoints(robot).map((j) => j.name)).toEqual(["shoulder_pan", "shoulder_lift"]);
  });

  it("falls back to sensible values when a joint omits them", () => {
    const minimal = parseUrdf(`<robot name="r"><link name="a"/><link name="b"/>
      <joint name="j" type="revolute"><parent link="a"/><child link="b"/></joint></robot>`);
    const joint = minimal.joints[0]!;
    expect(joint.xyz).toEqual([0, 0, 0]);
    expect(joint.axis).toEqual([0, 0, 1]);
    expect(joint.lower).toBeCloseTo(-Math.PI, 9);
  });

  it("refuses a description it cannot read", () => {
    expect(() => parseUrdf("<robot><link")).toThrow(/could not be read/);
  });
});

describe("the leader description hosted for this lesson", () => {
  // Fetched at run time, so a change at the source should surface here rather
  // than as a blank scene.
  it("still parses, keeps the follower's arm joints, and carries the handle", async () => {
    const url = "https://huggingface.co/datasets/cetiennec/so101-leader-urdf/resolve/main/so101_leader_new_calib.urdf";
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    const robot = parseUrdf(await response.text());
    expect(movingJoints(robot).map((j) => j.name).sort()).toEqual(
      ["elbow_flex", "gripper", "shoulder_lift", "shoulder_pan", "wrist_flex", "wrist_roll"].sort(),
    );
    expect(robot.links.map((l) => l.name)).toContain("trigger_link");
    expect(robot.links.map((l) => l.name)).toContain("handle_frame_link");
    const meshes = robot.links.flatMap((l) => l.visuals.map((v) => v.mesh));
    expect(meshes).toContain("assets/Handle_SO101.stl");
    expect(meshes).toContain("assets/Trigger_SO101.stl");
    // The trigger travels differently from the follower's jaw, so the scene
    // clamps each arm to its own limits.
    const trigger = robot.joints.find((j) => j.name === "gripper")!;
    expect(trigger.lower).toBeCloseTo(0, 6);
    expect(trigger.upper).toBeCloseTo(0.7853981633974483, 6);
  }, 30_000);
});
