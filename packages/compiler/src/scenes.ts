import { combineSceneSchemas, localSceneValues, sceneParam } from "@tangible/core";
import type { SceneInfo } from "./check.js";
import type { ParsedScript, Directive } from "./parse.js";
import { evaluateAuthoredState } from "./authored-state.js";
import { expand, type ExpandOptions, type ExpandResult } from "./expand.js";
import type { ResolvedCue } from "./resolve.js";
import { formatDiagnostic } from "./diagnostics.js";

const LOCAL_DIRECTIVES = new Set(["cue", "show", "hide", "camera", "bake", "track"]);

/** Keep local names and module contracts independent, including across revisits. */
export function combineScenes(scenes: Record<string, SceneInfo>, initialScene: string): SceneInfo {
  return { schema: combineSceneSchemas(scenes, initialScene), scenes, initialScene };
}

export function splitScenes(parsed: ParsedScript, scene: SceneInfo): {
  common: ParsedScript;
  scenes: Record<string, ParsedScript>;
} {
  const common: ParsedScript = { ...parsed, directives: [] };
  const scenes = Object.fromEntries(Object.keys(scene.scenes!).map((id) => [id, { ...parsed, directives: [] as Directive[] }]));
  let active = scene.initialScene!;
  for (const directive of parsed.directives) {
    if (directive.kind === "scene") active = directive.name;
    if (LOCAL_DIRECTIVES.has(directive.kind)) {
      if (Object.hasOwn(scenes, active)) scenes[active]!.directives.push(directive);
    }
    else common.directives.push(directive);
  }
  return { common, scenes };
}

/** Expand each scene with its own constants, camera state, groups and bakers. */
export function expandScenes(parsed: ParsedScript, cues: ResolvedCue[], scene: SceneInfo, opts: ExpandOptions): ExpandResult {
  const parts = splitScenes(parsed, scene);
  const common = new Set(parts.common.directives);
  const result = expand(cues.filter(({ directive }) => common.has(directive)), { schema: { scene: scene.schema.scene! } }, { ...opts, recorded: {}, recordedPaths: {} });
  for (const [id, info] of Object.entries(scene.scenes!)) {
    const script = parts.scenes[id]!;
    const directives = new Set(script.directives);
    const authored = evaluateAuthoredState(script, info);
    if (authored.diagnostics.length) throw new Error(formatDiagnostic(authored.diagnostics[0]!));
    const expanded = expand(cues.filter(({ directive }) => directives.has(directive)), info, {
      ...opts,
      bakes: authored.bakes,
      recorded: localSceneValues(id, opts.recorded ?? {}),
      recordedPaths: localSceneValues(id, opts.recordedPaths ?? {}),
    });
    for (const [param, track] of Object.entries(expanded.tracks)) result.tracks[sceneParam(id, param)] = track;
    for (const [param, path] of Object.entries(expanded.recorded)) result.recorded[sceneParam(id, param)] = path;
    result.warnings.push(...expanded.warnings.map((diagnostic) => ({ ...diagnostic, message: `scene "${id}": ${diagnostic.message}` })));
  }
  return result;
}
