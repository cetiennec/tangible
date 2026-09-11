import type { AssistantContext, ParamValue, Schema } from "./types.js";

/** Qualify a scene-local parameter in a lesson-wide state or track. */
export function sceneParam(scene: string, param: string): string {
  return `${scene}.${param}`;
}

/** Combine independent scene schemas with a script-controlled scene selector. */
export function combineSceneSchemas(scenes: Record<string, { schema: Schema }>, initialScene: string): Schema {
  const ids = Object.keys(scenes);
  if (!ids.includes(initialScene)) throw new Error(`unknown initial scene "${initialScene}"`);
  const schema: Schema = {
    scene: { type: { kind: "enum", values: ids }, default: initialScene, interpolate: "snap", ownership: "script" },
  };
  for (const [id, module] of Object.entries(scenes)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id) || id === "board") {
      throw new Error(`invalid scene id "${id}": use letters, digits, hyphens or underscores; "board" is reserved`);
    }
    for (const [param, spec] of Object.entries(module.schema)) schema[sceneParam(id, param)] = spec;
  }
  return schema;
}

/** Present only one scene's values, with the local names its module expects. */
export function localSceneValues<T>(scene: string, values: Readonly<Record<string, T>>): Record<string, T> {
  const prefix = `${scene}.`;
  return Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
}

/** Convert scene-local writes into lesson-wide writes. */
export function sceneWrites(scene: string, values: Record<string, ParamValue>): Record<string, ParamValue> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [sceneParam(scene, key), value]));
}

/** Restrict assistant controls and visible values to the active scene. */
export function assistantSceneContext(context: AssistantContext, state: Readonly<Record<string, ParamValue>>): AssistantContext {
  if (!context.scenes) return context;
  const id = state.scene;
  if (typeof id !== "string" || !Object.hasOwn(context.scenes, id)) throw new Error("assistant request must identify a registered active scene");
  const prefix = `${id}.`;
  return {
    ...context,
    schema: Object.fromEntries(Object.entries(context.schema).filter(([key]) => key === "scene" || key.startsWith(prefix))),
    commandable: context.commandable.filter((key) => key.startsWith(prefix)),
  };
}
