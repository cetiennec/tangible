// The SO-101 built in three.js from the robot description LeRobot publishes.
// The description and its meshes are fetched at run time from Hugging Face,
// which is where the LeRobot dataset visualiser gets them too.

import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { movingJoints, parseUrdf, type Triple, type UrdfRobot } from "./urdf.js";

const FOLLOWER_BASE = "https://huggingface.co/buckets/lerobot/robot-urdfs/resolve/so101";
export const URDF_URL = `${FOLLOWER_BASE}/so101_new_calib.urdf`;
// The leader, converted from the published CAD parts. It shares most of its
// meshes with the follower, so only the handle, trigger and wrist roll are new.
const LEADER_BASE = "https://huggingface.co/datasets/cetiennec/so101-leader-urdf/resolve/main";
const LEADER_URDF = `${LEADER_BASE}/so101_leader_new_calib.urdf`;

/** URDF fixed-axis roll, pitch and yaw, composed as Rz then Ry then Rx. */
export function rpyQuaternion(rpy: Triple): THREE.Quaternion {
  const [roll, pitch, yaw] = rpy;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pitch));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll));
  return q;
}

interface Pivot {
  object: THREE.Object3D;
  fixed: THREE.Quaternion;
  axis: THREE.Vector3;
}

interface Arm {
  root: THREE.Object3D;
  pivots: Map<string, Pivot>;
  links: Map<string, THREE.Object3D>;
  /** Each arm keeps its own travel, because the leader's trigger is not the
   *  follower's jaw and must not be driven past what it can do. */
  limits: Map<string, [number, number]>;
}

/**
 * Pull the two URDFs and every mesh they name into the browser cache.
 *
 * The arms are about sixteen megabytes of STL, and the scene that needs them
 * only appears several minutes into the lesson. The player builds a host for
 * the initial scene alone, so without this the download would not start until
 * the moment the arms have to be on screen, and a slow connection would reach
 * the Lego task before the meshes arrived. Called at module load, it runs
 * while the earlier scenes play. Failures are ignored on purpose: this only
 * warms a cache, and `load` still reports a genuine problem later.
 */
export async function warmRobotAssets(fetchImpl: typeof fetch = fetch): Promise<void> {
  await Promise.all(
    [[URDF_URL, FOLLOWER_BASE], [LEADER_URDF, LEADER_BASE]].map(async ([url, base]) => {
      const response = await fetchImpl(url!);
      if (!response.ok) return;
      const robot = parseUrdf(await response.text());
      const meshes = [...new Set(robot.links.flatMap((link) => link.visuals.map((visual) => visual.mesh)))];
      await Promise.all(meshes.map((name) => fetchImpl(`${base}/${name}`).catch(() => undefined)));
    }),
  );
}

export class RobotView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50);
  private root = new THREE.Group();
  private pair = new THREE.Group();
  private arms: Arm[] = [];
  private meshes: THREE.BufferGeometry[] = [];
  /** Keyed by mesh file name, so a part shared by both arms is fetched once. */
  private geometries = new Map<string, THREE.BufferGeometry>();
  private sharedMaterials = new Map<string, THREE.Material>();
  private materials: THREE.Material[] = [];
  private sized = "";
  private angleArcs: THREE.Line[] = [];
  private brick?: THREE.Group;
  /** A second, fixed camera watching the workspace, for the recording demo. */
  private sceneCam = new THREE.PerspectiveCamera(40, 1, 0.01, 50);

  constructor(private overlay: HTMLElement) {
    this.canvas = overlay.ownerDocument.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.position = "absolute";
    this.canvas.style.pointerEvents = "none";
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x99a3a8, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(0.6, 1.1, 0.8);
    this.scene.add(key);
    // The description is Z-up; tip the whole robot so the view is Y-up.
    this.root.rotation.x = -Math.PI / 2;
    this.root.add(this.pair);
    this.scene.add(this.root);
    overlay.append(this.canvas);
  }

  /** Read one description and whatever meshes it names that are not loaded yet. */
  private async read(url: string, base: string, fetchImpl: typeof fetch): Promise<UrdfRobot> {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const robot = parseUrdf(await response.text());
    const wanted = [...new Set(robot.links.flatMap((link) => link.visuals.map((visual) => visual.mesh)))];
    const loader = new STLLoader();
    await Promise.all(
      wanted
        .filter((name) => !this.geometries.has(name))
        .map(async (name) => {
          const geometry = await loader.loadAsync(`${base}/${name}`);
          geometry.computeVertexNormals();
          this.meshes.push(geometry);
          this.geometries.set(name, geometry);
        }),
    );
    return robot;
  }

  /**
   * Build the follower and, beside it, the leader. They share every mesh but
   * the handle, trigger and wrist roll, so the second arm costs little.
   */
  async load(fetchImpl: typeof fetch = fetch): Promise<UrdfRobot> {
    const follower = await this.read(URDF_URL, FOLLOWER_BASE, fetchImpl);
    this.arms.push(this.assemble(follower));
    const leader = await this.read(LEADER_URDF, LEADER_BASE, fetchImpl);
    this.arms.push(this.assemble(leader));
    for (const [index, robot] of [follower, leader].entries()) {
      for (const joint of movingJoints(robot)) this.setJoint(joint.name, 0, index);
    }
    return follower;
  }

  private assemble(robot: UrdfRobot): Arm {
    const geometries = this.geometries;
    const shared = this.sharedMaterials;
    const objects = new Map<string, THREE.Object3D>();
    for (const link of robot.links) {
      const group = new THREE.Group();
      for (const visual of link.visuals) {
        const geometry = geometries.get(visual.mesh);
        if (!geometry) continue;
        const key = visual.material ?? "default";
        let material = shared.get(key);
        if (!material) {
          const rgb = robot.materials[key] ?? [0.72, 0.74, 0.76];
          material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(...rgb),
            roughness: 0.62,
            metalness: 0.08,
          });
          shared.set(key, material);
          this.materials.push(material);
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...visual.xyz);
        mesh.quaternion.copy(rpyQuaternion(visual.rpy));
        group.add(mesh);
      }
      objects.set(link.name, group);
    }

    const pivots = new Map<string, Pivot>();
    for (const joint of robot.joints) {
      const parent = objects.get(joint.parent);
      const child = objects.get(joint.child);
      if (!parent || !child) continue;
      const pivot = new THREE.Object3D();
      pivot.position.set(...joint.xyz);
      const fixed = rpyQuaternion(joint.rpy);
      pivot.quaternion.copy(fixed);
      pivot.add(child);
      parent.add(pivot);
      if (joint.type !== "fixed") {
        pivots.set(joint.name, { object: pivot, fixed, axis: new THREE.Vector3(...joint.axis).normalize() });
      }
    }

    const limits = new Map<string, [number, number]>(
      robot.joints.filter((joint) => joint.type !== "fixed").map((joint) => [joint.name, [joint.lower, joint.upper]]),
    );
    const root = new THREE.Group();
    const base = objects.get(robot.root);
    if (base) root.add(base);
    this.pair.add(root);
    return { root, pivots, links: objects, limits };
  }

  setJoint(name: string, angle: number, arm = 0): void {
    const target = this.arms[arm];
    const pivot = target?.pivots.get(name);
    if (!target || !pivot) return;
    const travel = target.limits.get(name);
    if (travel) angle = Math.min(travel[1], Math.max(travel[0], angle));
    pivot.object.quaternion
      .copy(pivot.fixed)
      .multiply(new THREE.Quaternion().setFromAxisAngle(pivot.axis, angle));
  }

  /**
   * Stand the arms side by side, or hide all but the first. They are separated
   * along the camera's own sideways direction rather than a fixed world axis,
   * so one never ends up hidden behind the other as the view turns.
   */
  arrange(showSecond: boolean, gap: number, azimuth: number): void {
    const [first, second] = this.arms;
    // The group is tipped a quarter turn about x, so the screen-sideways
    // direction lands on local (cos, sin, 0).
    const half = gap / 2;
    const sideways = { x: Math.cos(azimuth) * half, y: Math.sin(azimuth) * half };
    if (first) first.root.position.set(showSecond ? sideways.x : 0, showSecond ? sideways.y : 0, 0);
    if (second) {
      second.root.position.set(-sideways.x, -sideways.y, 0);
      second.root.visible = showSecond;
    }
  }

  get armCount(): number {
    return this.arms.length;
  }

  /**
   * The on-screen offset arrange() has given this arm right now. A point
   * measured with measureGrip (before arrange had ever run once, so before
   * any offset existed) needs this added back in before it means anything on
   * screen, the same way gripPoint's live reading already includes it.
   */
  armOffset(arm = 0): [number, number, number] {
    const root = this.arms[arm]?.root;
    return root ? [root.position.x, root.position.y, root.position.z] : [0, 0, 0];
  }

  /** Place the camera on an orbit around the arms. */
  /**
   * Draw the bend at two joints, as an arc between the link coming in and the
   * link going out. These are the angles teleoperation copies across.
   */
  showJointAngles(arm: number, visible: boolean, color: string): void {
    if (visible && this.angleArcs.length === 0) {
      const material = new THREE.LineBasicMaterial({ color: new THREE.Color(color) });
      this.materials.push(material);
      for (let i = 0; i < 2; i += 1) {
        const geometry = new THREE.BufferGeometry();
        this.meshes.push(geometry);
        const arc = new THREE.Line(geometry, material);
        this.angleArcs.push(arc);
        this.scene.add(arc);
      }
    }
    for (const arc of this.angleArcs) arc.visible = visible;
    if (!visible) return;

    const at = (name: string) => {
      const link = this.arms[arm]?.links.get(name);
      if (!link) return undefined;
      link.updateWorldMatrix(true, false);
      return link.getWorldPosition(new THREE.Vector3());
    };
    const chain: [string, string, string][] = [
      ["shoulder_link", "upper_arm_link", "lower_arm_link"],
      ["upper_arm_link", "lower_arm_link", "wrist_link"],
    ];
    for (const [index, [before, corner, after]] of chain.entries()) {
      const a = at(before);
      const b = at(corner);
      const c = at(after);
      const line = this.angleArcs[index];
      if (!a || !b || !c || !line) continue;
      const first = a.clone().sub(b);
      const second = c.clone().sub(b);
      const radius = Math.min(first.length(), second.length()) * 0.42;
      if (radius < 1e-4) continue;
      first.normalize();
      second.normalize();
      const total = first.angleTo(second);
      const axis = new THREE.Vector3().crossVectors(first, second);
      if (axis.lengthSq() < 1e-9) continue;
      axis.normalize();
      const points: THREE.Vector3[] = [];
      for (let step = 0; step <= 24; step += 1) {
        const spoke = first.clone().applyAxisAngle(axis, (total * step) / 24).multiplyScalar(radius);
        points.push(b.clone().add(spoke));
      }
      line.geometry.setFromPoints(points);
    }
  }

  /** A brick for the pair to move between two spots. */
  setBrick(at: [number, number, number] | undefined, color: string): void {
    if (at && !this.brick) {
      const group = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.42 });
      this.materials.push(material);
      const body = new THREE.BoxGeometry(0.05, 0.022, 0.032);
      this.meshes.push(body);
      group.add(new THREE.Mesh(body, material));
      const stud = new THREE.CylinderGeometry(0.0075, 0.0075, 0.007, 14);
      this.meshes.push(stud);
      for (const dx of [-0.0125, 0.0125]) {
        for (const dz of [-0.008, 0.008]) {
          const pin = new THREE.Mesh(stud, material);
          pin.position.set(dx, 0.0145, dz);
          group.add(pin);
        }
      }
      this.scene.add(group);
      this.brick = group;
    }
    if (!this.brick) return;
    this.brick.visible = Boolean(at);
    if (at) this.brick.position.set(...at);
  }

  /** Where the gripper is right now, in the frame the brick lives in. */
  gripPoint(arm = 0): [number, number, number] | undefined {
    const link = this.arms[arm]?.links.get("gripper_frame_link");
    if (!link) return undefined;
    link.updateWorldMatrix(true, false);
    const at = link.getWorldPosition(new THREE.Vector3());
    return [at.x, at.y, at.z];
  }

  /** Hold a pose just long enough to read where the gripper lands. */
  measureGrip(pose: { joint: string; angle: number }[], arm = 0): [number, number, number] | undefined {
    for (const entry of pose) this.setJoint(entry.joint, entry.angle, arm);
    this.pair.updateWorldMatrix(true, true);
    return this.gripPoint(arm);
  }

  setCamera(azimuth: number, elevation: number, distance: number): void {
    const target = new THREE.Vector3(0, 0.12, 0);
    this.camera.position.set(
      target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.camera.lookAt(target);
  }

  /**
   * A second, fixed camera pointed at the workspace, in world coordinates —
   * the caller is responsible for adding the follower's current arrange()
   * offset first, the same way offsetBrick does for the brick.
   */
  setSceneCamera(position: [number, number, number], lookAt: [number, number, number]): void {
    this.sceneCam.position.set(...position);
    this.sceneCam.up.set(0, 1, 0);
    this.sceneCam.lookAt(...lookAt);
  }

  /** Position and size the WebGL canvas over a region of the scene. */
  place(box: { left: number; top: number; width: number; height: number }, view: { width: number; height: number }): void {
    this.canvas.style.left = `${(box.left / view.width) * 100}%`;
    this.canvas.style.top = `${(box.top / view.height) * 100}%`;
    this.canvas.style.width = `${(box.width / view.width) * 100}%`;
    this.canvas.style.height = `${(box.height / view.height) * 100}%`;
    const key = `${Math.round(box.width)}x${Math.round(box.height)}`;
    if (key === this.sized) return;
    this.sized = key;
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false);
    this.camera.aspect = Math.max(0.1, box.width / Math.max(1, box.height));
    this.camera.updateProjectionMatrix();
  }

  /**
   * Render the main view, then optionally a second pass from sceneCam into a
   * corner of the same canvas — an actual second "screen", not an icon,
   * showing what the recording camera watching the task would see. `pip` is
   * in the same box-relative pixel units as place(); WebGL's viewport origin
   * is the bottom-left, so the y coordinate is flipped here once, rather than
   * asking every caller to think in that convention.
   */
  render(pip?: { x: number; y: number; width: number; height: number }): void {
    const width = this.renderer.domElement.width / this.renderer.getPixelRatio();
    const height = this.renderer.domElement.height / this.renderer.getPixelRatio();
    this.renderer.setViewport(0, 0, width, height);
    this.renderer.render(this.scene, this.camera);
    if (!pip) return;
    this.sceneCam.aspect = Math.max(0.1, pip.width / Math.max(1, pip.height));
    this.sceneCam.updateProjectionMatrix();
    const glY = height - pip.y - pip.height;
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(pip.x, glY, pip.width, pip.height);
    this.renderer.setViewport(pip.x, glY, pip.width, pip.height);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.sceneCam);
    this.renderer.setScissorTest(false);
  }

  dispose(): void {
    for (const geometry of this.meshes) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.brick = undefined;
    this.angleArcs = [];
    this.renderer.dispose();
    this.canvas.remove();
    void this.overlay;
  }
}
