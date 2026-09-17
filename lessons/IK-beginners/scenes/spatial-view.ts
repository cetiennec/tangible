// Draws the five-jointed arm in three dimensions. Kept apart from the solver so
// the mathematics can be tested without a graphics context.

import * as THREE from "three";
import type { SpatialPose, Vec3 } from "./spatial.js";

interface Arm {
  group: THREE.Group;
  bones: THREE.Mesh[];
  joints: THREE.Mesh[];
}

const UP = new THREE.Vector3(0, 1, 0);

export class SpatialView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.01, 60);
  private live: Arm;
  private ghosts: Arm[] = [];
  private owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  private sized = "";

  constructor(overlay: HTMLElement, colors: { bone: string; joint: string; target: string }, ghostCount: number) {
    this.canvas = overlay.ownerDocument.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.position = "absolute";
    this.canvas.style.pointerEvents = "none";
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa5aa, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(1.2, 1.6, 1.1);
    this.scene.add(key);

    for (let i = 0; i < ghostCount; i += 1) this.ghosts.push(this.buildArm(colors.bone, 0.14, 0.022));
    this.live = this.buildArm(colors.bone, 1, 0.038, colors.joint);

    const target = new THREE.Mesh(
      this.own(new THREE.SphereGeometry(0.06, 20, 14)),
      this.own(new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.target), roughness: 0.4 })),
    );
    this.scene.add(target);
    overlay.append(this.canvas);
  }

  private own<T extends THREE.BufferGeometry | THREE.Material>(item: T): T {
    this.owned.push(item);
    return item;
  }

  private buildArm(bone: string, opacity: number, radius: number, jointColor?: string): Arm {
    const group = new THREE.Group();
    const boneMaterial = this.own(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(bone),
        roughness: 0.5,
        transparent: opacity < 1,
        opacity,
      }),
    );
    const bones: THREE.Mesh[] = [];
    const joints: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i += 1) {
      const mesh = new THREE.Mesh(this.own(new THREE.CylinderGeometry(radius, radius, 1, 12)), boneMaterial);
      bones.push(mesh);
      group.add(mesh);
    }
    if (jointColor) {
      const jointMaterial = this.own(new THREE.MeshStandardMaterial({ color: new THREE.Color(jointColor), roughness: 0.4 }));
      for (let i = 0; i < 5; i += 1) {
        const mesh = new THREE.Mesh(this.own(new THREE.SphereGeometry(radius * 1.7, 16, 12)), jointMaterial);
        joints.push(mesh);
        group.add(mesh);
      }
    }
    this.scene.add(group);
    return { group, bones, joints };
  }

  /** Stretch one cylinder so it spans from a to b. */
  private span(mesh: THREE.Mesh, a: Vec3, b: Vec3): void {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const along = to.clone().sub(from);
    const length = along.length() || 1e-6;
    mesh.position.copy(from).addScaledVector(along, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, along.clone().divideScalar(length));
    mesh.scale.set(1, length, 1);
  }

  private pose(arm: Arm, pose: SpatialPose): void {
    for (let i = 0; i < arm.bones.length; i += 1) {
      this.span(arm.bones[i]!, pose.joints[i]!, pose.joints[i + 1]!);
    }
    for (let i = 0; i < arm.joints.length; i += 1) {
      arm.joints[i]!.position.set(...pose.joints[i]!);
    }
  }

  setPoses(live: SpatialPose, ghosts: SpatialPose[]): void {
    this.pose(this.live, live);
    for (let i = 0; i < this.ghosts.length; i += 1) {
      const ghost = ghosts[i];
      this.ghosts[i]!.group.visible = Boolean(ghost);
      if (ghost) this.pose(this.ghosts[i]!, ghost);
    }
  }

  setCamera(azimuth: number, elevation: number, distance: number, target: Vec3): void {
    const at = new THREE.Vector3(...target);
    this.camera.position.set(
      at.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      at.y + distance * Math.sin(elevation),
      at.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.camera.lookAt(at);
  }

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
    for (const item of this.owned) item.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
