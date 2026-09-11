// SceneHost and the scene-module contract. A scene renders as
// a pure function of state — it may cache expensive geometry but must not keep
// mutable state that affects output across frames (that would break value-at-time).

import type { Schema, ParamValue, PlainState, Handle } from "@tangible/core";
import { localSceneValues, sceneParam, sceneWrites } from "@tangible/core";
import type { ParameterActivityMap } from "./parameter-activity.js";

export type { Handle };

export interface SceneContext {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement; // for DOM labels / in-scene KaTeX
  viewport(): { width: number; height: number };
  write(param: string, value: ParamValue): void; // DOM controls enter normal reconciliation
  reset(param: string): void;
  pause(): void;
}

export interface SceneFrame {
  dt: number;
  activity: ParameterActivityMap;
}

export interface SceneInstance {
  render(state: Readonly<PlainState>, frame: SceneFrame): void;
  handles(): Handle[];
  dispose(): void;
}

export interface SceneModule {
  schema: Schema;
  presets?: Record<string, Record<string, ParamValue>>;
  constants?: Record<string, ParamValue>;
  create(ctx: SceneContext): SceneInstance;
}

/** Owns a scene instance and drives its imperative render from plain state. */
export class SceneHost {
  readonly instance: SceneInstance;

  constructor(module: SceneModule, ctx: SceneContext, private sceneId?: string) {
    this.instance = module.create(sceneId ? {
      ...ctx,
      write: (param, value) => ctx.write(sceneParam(sceneId, param), value),
      reset: (param) => ctx.reset(sceneParam(sceneId, param)),
    } : ctx);
  }

  render(state: Readonly<PlainState>, frame: SceneFrame): void {
    this.instance.render(this.localState(state), this.sceneId ? { ...frame, activity: localSceneValues(this.sceneId, frame.activity) } : frame);
  }

  handles(): Handle[] {
    const handles = this.instance.handles();
    const id = this.sceneId;
    if (!id) return handles;
    return handles.map((handle) => ({
      id: sceneParam(id, handle.id),
      params: handle.params.map((param) => sceneParam(id, param)),
      hitTest: (x, y, state) => handle.hitTest(x, y, this.localState(state)),
      onDown: handle.onDown ? (x, y, state) => handle.onDown!(x, y, this.localState(state)) : undefined,
      onDrag: (x, y, state) => sceneWrites(id, handle.onDrag(x, y, this.localState(state))),
      onWheel: handle.onWheel ? (x, y, delta, state) => sceneWrites(id, handle.onWheel!(x, y, delta, this.localState(state))) : undefined,
    }));
  }

  private localState(state: Readonly<PlainState>): Readonly<PlainState> {
    return this.sceneId ? localSceneValues(this.sceneId, state) : state;
  }

  dispose(): void {
    this.instance.dispose();
  }
}
