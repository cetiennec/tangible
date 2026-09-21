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

/** Which camera a small feed panel shows. */
export type FeedSource = "workspace" | "wrist";

/** One feed panel: where its picture comes from, and how big it is on screen. */
export interface Feed {
  source: FeedSource;
  canvas: HTMLCanvasElement;
  /** Size on screen in CSS pixels. */
  width: number;
  height: number;
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
  private webcam?: THREE.Group;
  private wristProp?: THREE.Group;
  /** A second, fixed camera watching the workspace, for the recording demo. */
  private sceneCam = new THREE.PerspectiveCamera(62, 1, 0.01, 50);
  /** A third camera carried on the gripper, looking the way the jaws point. */
  private wristCam = new THREE.PerspectiveCamera(70, 1, 0.005, 50);

  constructor(private overlay: HTMLElement) {
    this.canvas = overlay.ownerDocument.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.position = "absolute";
    this.canvas.style.zIndex = "0";
    this.canvas.style.pointerEvents = "none";
    // preserveDrawingBuffer keeps the pixels readable after a render, which
    // is how render() copies the camera-feed pass out of this buffer and
    // into the small 2D canvas that shows it.
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
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
   * The on-screen offset arrange() has given this arm right now, in world
   * space. A point measured with measureGrip (before arrange had ever run
   * once, so before any offset existed) needs this added back in before it
   * means anything on screen, the same way gripPoint's live reading already
   * includes it.
   *
   * This reads the root's *world* position, not its local .position: the
   * whole assembly sits under a -90-degree rotation about x (the URDF is
   * Z-up, the scene is Y-up), so arrange()'s local (dx, dy, 0) offset lands
   * at world (dx, 0, -dy), not (dx, dy, 0). Adding the raw local values
   * would leak dy into world height instead of depth -- which is exactly
   * what made the brick sit far too high before this fix, since HOME's
   * azimuth gives sin(azimuth) a sizeable value. The root sat at local
   * (0,0,0) when measureGrip ran, and rotating the zero vector is still
   * zero, so the baseline this offset is added to was never affected by the
   * mistake -- only the offset read back later was.
   */
  armOffset(arm = 0): [number, number, number] {
    const root = this.arms[arm]?.root;
    if (!root) return [0, 0, 0];
    root.updateWorldMatrix(true, false);
    const world = root.getWorldPosition(new THREE.Vector3());
    return [world.x, world.y, world.z];
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

  /** Where a named joint's pivot is right now, for labelling it on screen. */
  jointWorldPosition(name: string, arm = 0): [number, number, number] | undefined {
    const pivot = this.arms[arm]?.pivots.get(name);
    if (!pivot) return undefined;
    pivot.object.updateWorldMatrix(true, false);
    const at = pivot.object.getWorldPosition(new THREE.Vector3());
    return [at.x, at.y, at.z];
  }

  /**
   * A world point projected through the main camera, in the same box-local
   * pixel units place() uses — undefined once the point is behind the
   * camera, so a label does not appear on the wrong side of the screen.
   */
  projectToScreen(worldPos: [number, number, number], boxWidth: number, boxHeight: number): { x: number; y: number } | undefined {
    const v = new THREE.Vector3(...worldPos).project(this.camera);
    if (v.z > 1) return undefined;
    return { x: (v.x * 0.5 + 0.5) * boxWidth, y: (1 - (v.y * 0.5 + 0.5)) * boxHeight };
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

  /**
   * A small camera-shaped prop at sceneCam's own position, pointed the same
   * way — so the recording camera is something visible in the scene, not
   * only a rectangle of pixels in a corner. World coordinates, same as
   * setSceneCamera; the caller adds the arrange() offset the same way.
   */
  setWebcam(position: [number, number, number], lookAt: [number, number, number]): void {
    if (!this.webcam) {
      this.webcam = this.cameraProp(1, true);
      this.scene.add(this.webcam);
    }
    // sceneCam sits exactly at `position`; placing the mesh's own centre
    // there too put the camera inside the dark body, rendering nothing but
    // that material — a black feed. Pull the body back along the view
    // direction so the lens tip lands at the camera's eye instead.
    const eye = new THREE.Vector3(...position);
    const target = new THREE.Vector3(...lookAt);
    const forward = target.clone().sub(eye).normalize();
    const bodyCentre = eye.clone().addScaledVector(forward, -0.02);
    this.webcam.visible = true;
    this.webcam.position.copy(bodyCentre);
    this.webcam.up.set(0, 1, 0);
    this.webcam.lookAt(target);
  }

  /**
   * A small camera-shaped prop: a body, a lens, and optionally the stand a
   * camera fixed above the workspace needs and one riding the gripper does
   * not. It points along its own +z, so lookAt aims it.
   */
  private cameraProp(scale: number, stand: boolean): THREE.Group {
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.2 });
    const lensGlass = new THREE.MeshStandardMaterial({ color: 0x1a1d1f, roughness: 0.15, metalness: 0.6 });
    this.materials.push(dark, lensGlass);

    const body = new THREE.BoxGeometry(0.03 * scale, 0.024 * scale, 0.02 * scale);
    const lens = new THREE.CylinderGeometry(0.008 * scale, 0.009 * scale, 0.014 * scale, 16);
    this.meshes.push(body, lens);

    group.add(new THREE.Mesh(body, dark));
    const lensMesh = new THREE.Mesh(lens, lensGlass);
    lensMesh.rotation.x = Math.PI / 2;
    lensMesh.position.z = 0.017 * scale;
    group.add(lensMesh);
    if (stand) {
      const post = new THREE.CylinderGeometry(0.003, 0.003, 0.05, 8);
      this.meshes.push(post);
      const postMesh = new THREE.Mesh(post, dark);
      postMesh.position.y = -0.037;
      group.add(postMesh);
    }
    return group;
  }

  /** A named link's position in world space. */
  private linkPosition(name: string, arm: number): THREE.Vector3 | undefined {
    const link = this.arms[arm]?.links.get(name);
    if (!link) return undefined;
    link.updateWorldMatrix(true, false);
    return link.getWorldPosition(new THREE.Vector3());
  }

  /**
   * A camera carried on the gripper, looking out past the jaws — the second
   * point of view a real recording rig has, besides the fixed one.
   *
   * The published SO-101 description has no camera in it, so this is added
   * to the model here rather than loaded: the prop and its camera become
   * children of the gripper link with a fixed local transform, which is what
   * a URDF fixed joint would have given them. Being children, they then ride
   * the arm on their own and need no work per frame.
   *
   * The placement is measured off the arm rather than guessed. The gripper
   * tip's position in the gripper link's own frame is a constant of the
   * robot, since the joint between those two links is fixed, so it gives a
   * reliable forward direction without knowing the description's axes. The up
   * direction has to come from that frame too: the jaws often point straight
   * down, and a world up of (0, 1, 0) would then be parallel to the view
   * direction, where there is no single answer and the picture would spin.
   */
  setWristCamera(visible: boolean, arm = 0): void {
    if (!this.wristProp && visible) this.attachWristCamera(arm);
    if (this.wristProp) this.wristProp.visible = visible;
  }

  private attachWristCamera(arm: number): void {
    const link = this.arms[arm]?.links.get("gripper_link");
    const tipLink = this.arms[arm]?.links.get("gripper_frame_link");
    if (!link || !tipLink) return;
    link.updateWorldMatrix(true, false);
    tipLink.updateWorldMatrix(true, false);
    const tip = link.worldToLocal(tipLink.getWorldPosition(new THREE.Vector3()));
    const forward = tip.clone().normalize();
    let up = new THREE.Vector3(0, 0, 1);
    if (Math.abs(up.dot(forward)) > 0.9) up = new THREE.Vector3(1, 0, 0);

    // On the side of the gripper, clear of its shell, looking out past the
    // jaws: back along the gripper axis, then out sideways. Without the
    // sideways part the camera sits inside the gripper mesh, where it is both
    // invisible and looking at the inside of the model.
    const side = new THREE.Vector3().crossVectors(up, forward).normalize();
    const eye = tip.clone().addScaledVector(forward, -0.065).addScaledVector(side, 0.045);
    // Aimed just past the jaws, not far beyond them: the tip is where the
    // brick is held, so that is what belongs in the middle of the picture.
    const target = tip.clone().addScaledVector(forward, 0.035);
    // Further from the lens still, so the camera is not inside its own body.
    const body = eye.clone().addScaledVector(forward, -0.02).addScaledVector(side, 0.006);

    const prop = this.cameraProp(0.78, false);
    prop.position.copy(body);
    // A plain object's lookAt points its +z at the target, a camera's points
    // its -z, and the lens of the prop is on its +z. Hence the swap.
    prop.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(target, body, up));
    link.add(prop);
    this.wristProp = prop;

    this.wristCam.position.copy(eye);
    this.wristCam.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, target, up));
    link.add(this.wristCam);
  }

  /** Hide the camera prop when the recording demo isn't running. */
  hideWebcam(): void {
    if (this.webcam) this.webcam.visible = false;
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
   * Render the main view, and each small camera feed into its own 2D canvas.
   *
   * A feed is drawn first, into the bottom-left corner of this canvas's own
   * buffer, copied straight out of it, and then painted over by the main
   * view — so that corner is never seen. Copying rather than leaving it in
   * place as a scissored sub-viewport is what lets a feed sit anywhere on
   * screen, including the board panel on the right, which is outside this
   * canvas altogether. Each feed costs one more pass over the scene, so only
   * ask for the ones actually on screen.
   */
  render(feeds: Feed[] = []): void {
    const ratio = this.renderer.getPixelRatio();
    const width = this.renderer.domElement.width / ratio;
    const height = this.renderer.domElement.height / ratio;
    for (const feed of feeds) this.drawFeed(feed, ratio, width, height);
    this.renderer.setViewport(0, 0, width, height);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * One feed pass. `width` and `height` on the feed are its size on screen in
   * CSS pixels; its backing store is sized from them here, so the pixel ratio
   * stays in one place.
   */
  private drawFeed(feed: Feed, ratio: number, viewWidth: number, viewHeight: number): void {
    const camera = feed.source === "wrist" ? this.wristCam : this.sceneCam;
    // The copy is one for one, so a feed can be no larger than the buffer it
    // is read out of.
    const feedWidth = Math.max(1, Math.min(viewWidth, feed.width));
    const feedHeight = Math.max(1, Math.min(viewHeight, feed.height));
    const pixelWidth = Math.round(feedWidth * ratio);
    const pixelHeight = Math.round(feedHeight * ratio);
    if (feed.canvas.width !== pixelWidth) feed.canvas.width = pixelWidth;
    if (feed.canvas.height !== pixelHeight) feed.canvas.height = pixelHeight;
    camera.aspect = feedWidth / feedHeight;
    camera.updateProjectionMatrix();
    this.renderer.setViewport(0, 0, feedWidth, feedHeight);
    this.renderer.render(this.scene, camera);
    const g = feed.canvas.getContext("2d");
    if (!g) return;
    // WebGL's origin is the bottom-left, so the corner just drawn is the last
    // rows of the image drawImage reads.
    g.clearRect(0, 0, pixelWidth, pixelHeight);
    g.drawImage(
      this.canvas,
      0,
      this.renderer.domElement.height - pixelHeight,
      pixelWidth,
      pixelHeight,
      0,
      0,
      pixelWidth,
      pixelHeight,
    );
  }

  /** Hide the canvas without disposing anything, for a beat that precedes it. */
  setVisible(visible: boolean): void {
    this.canvas.style.visibility = visible ? "" : "hidden";
  }

  dispose(): void {
    for (const geometry of this.meshes) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.brick = undefined;
    this.webcam = undefined;
    this.wristProp = undefined;
    this.angleArcs = [];
    this.renderer.dispose();
    this.canvas.remove();
    void this.overlay;
  }
}
