// The SO-101 built in three.js from the robot description LeRobot publishes.
// The description and its meshes are fetched at run time from Hugging Face,
// which is where the LeRobot dataset visualiser gets them too.

import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { movingJoints, parseUrdf, type Triple, type UrdfRobot } from "./urdf.js";

const BASE = "https://huggingface.co/buckets/lerobot/robot-urdfs/resolve/so101";
export const URDF_URL = `${BASE}/so101_new_calib.urdf`;

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
  private materials: THREE.Material[] = [];
  private sized = "";

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

  /**
   * Fetch the description and every mesh it names, then assemble `count` arms.
   * The geometries are loaded once and shared, so a second arm costs no extra
   * download and almost no extra memory.
   */
  async load(count = 1, fetchImpl: typeof fetch = fetch): Promise<UrdfRobot> {
    const response = await fetchImpl(URDF_URL);
    if (!response.ok) throw new Error(`the robot description returned ${response.status}`);
    const robot = parseUrdf(await response.text());

    const names = [...new Set(robot.links.flatMap((link) => link.visuals.map((visual) => visual.mesh)))];
    const loader = new STLLoader();
    const geometries = new Map<string, THREE.BufferGeometry>();
    await Promise.all(
      names.map(async (name) => {
        const geometry = await loader.loadAsync(`${BASE}/${name}`);
        geometry.computeVertexNormals();
        this.meshes.push(geometry);
        geometries.set(name, geometry);
      }),
    );

    const shared = new Map<string, THREE.Material>();
    for (let index = 0; index < count; index += 1) {
      this.arms.push(this.assemble(robot, geometries, shared));
    }
    for (const arm of this.arms) {
      for (const joint of movingJoints(robot)) this.setJoint(joint.name, 0, this.arms.indexOf(arm));
    }
    return robot;
  }

  private assemble(
    robot: UrdfRobot,
    geometries: Map<string, THREE.BufferGeometry>,
    shared: Map<string, THREE.Material>,
  ): Arm {
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

    const root = new THREE.Group();
    const base = objects.get(robot.root);
    if (base) root.add(base);
    this.pair.add(root);
    return { root, pivots };
  }

  setJoint(name: string, angle: number, arm = 0): void {
    const pivot = this.arms[arm]?.pivots.get(name);
    if (!pivot) return;
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

  /** Place the camera on an orbit around the arms. */
  setCamera(azimuth: number, elevation: number, distance: number): void {
    const target = new THREE.Vector3(0, 0.12, 0);
    this.camera.position.set(
      target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.camera.lookAt(target);
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

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const geometry of this.meshes) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    void this.overlay;
  }
}
