// A small URDF reader, covering exactly what the SO-101 description uses:
// links carrying visual meshes, and joints that place one link on another and
// turn about an axis. Kept free of three.js so it can be tested on its own.

export type Triple = [number, number, number];

export interface UrdfVisual {
  xyz: Triple;
  rpy: Triple;
  mesh: string;
  material?: string;
}

export interface UrdfLink {
  name: string;
  visuals: UrdfVisual[];
}

export interface UrdfJoint {
  name: string;
  type: string;
  xyz: Triple;
  rpy: Triple;
  parent: string;
  child: string;
  axis: Triple;
  lower: number;
  upper: number;
}

export interface UrdfRobot {
  name: string;
  links: UrdfLink[];
  joints: UrdfJoint[];
  materials: Record<string, Triple>;
  root: string;
}

function triple(value: string | null | undefined, fallback: Triple): Triple {
  if (!value) return fallback;
  const parts = value.trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? (parts as Triple) : fallback;
}

function placement(element: Element | null): { xyz: Triple; rpy: Triple } {
  const origin = element?.querySelector(":scope > origin");
  return {
    xyz: triple(origin?.getAttribute("xyz"), [0, 0, 0]),
    rpy: triple(origin?.getAttribute("rpy"), [0, 0, 0]),
  };
}

export function parseUrdf(xml: string): UrdfRobot {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const failure = document.querySelector("parsererror");
  if (failure) throw new Error(`the robot description could not be read: ${failure.textContent ?? ""}`);
  const robot = document.querySelector("robot");
  if (!robot) throw new Error("the robot description has no <robot> element");

  const materials: Record<string, Triple> = {};
  for (const element of robot.querySelectorAll(":scope > material")) {
    const name = element.getAttribute("name");
    const rgba = element.querySelector(":scope > color")?.getAttribute("rgba");
    if (name && rgba) materials[name] = triple(rgba.split(/\s+/).slice(0, 3).join(" "), [0.7, 0.7, 0.7]);
  }

  const links: UrdfLink[] = [...robot.querySelectorAll(":scope > link")].map((element) => ({
    name: element.getAttribute("name") ?? "",
    visuals: [...element.querySelectorAll(":scope > visual")].flatMap((visual) => {
      const mesh = visual.querySelector(":scope > geometry > mesh")?.getAttribute("filename");
      if (!mesh) return [];
      const { xyz, rpy } = placement(visual);
      const material = visual.querySelector(":scope > material")?.getAttribute("name") ?? undefined;
      return [{ xyz, rpy, mesh, ...(material ? { material } : {}) }];
    }),
  }));

  const joints: UrdfJoint[] = [...robot.querySelectorAll(":scope > joint")].map((element) => {
    const limit = element.querySelector(":scope > limit");
    const { xyz, rpy } = placement(element);
    return {
      name: element.getAttribute("name") ?? "",
      type: element.getAttribute("type") ?? "fixed",
      xyz,
      rpy,
      parent: element.querySelector(":scope > parent")?.getAttribute("link") ?? "",
      child: element.querySelector(":scope > child")?.getAttribute("link") ?? "",
      axis: triple(element.querySelector(":scope > axis")?.getAttribute("xyz"), [0, 0, 1]),
      lower: Number(limit?.getAttribute("lower") ?? -Math.PI),
      upper: Number(limit?.getAttribute("upper") ?? Math.PI),
    };
  });

  // The root is the only link that is never something else's child.
  const children = new Set(joints.map((joint) => joint.child));
  const root = links.find((link) => !children.has(link.name))?.name ?? links[0]?.name ?? "";
  return { name: robot.getAttribute("name") ?? "robot", links, joints, materials, root };
}

/** The joints a person can actually drive, in the order they appear down the arm. */
export function movingJoints(robot: UrdfRobot): UrdfJoint[] {
  return robot.joints.filter((joint) => joint.type === "revolute" || joint.type === "continuous");
}
