// Load and type the lesson.yaml manifest.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { DEFAULT_ASSISTANT_LIMITS, type AssistantLimits } from "@tangible/core";

export type TtsConfig =
  | { provider: "supertonic"; speed?: number }
  | { provider: "elevenlabs"; voice: string; model?: string; speed?: number }
  | { provider: "hf-endpoint"; voice: string; revision?: string };

export type SceneSelection =
  | { scene: string; scenes?: never; initialScene?: never }
  | { scene?: never; scenes: Record<string, string>; initialScene: string };

export type Manifest = SceneSelection & {
  id: string;
  title: string;
  promise: string;
  tags?: string[];
  defaults: { anticipation: number; ease: string; transition: number };
  tts?: TtsConfig;
  offlineTts?: { speed?: number };
  deployment?: {
    provider: "huggingface";
    space: string;
  };
  assistant?: {
    provider: "huggingface";
    model: string;
    context: string;
    startOpen?: boolean;
    commandable: string[];
    limits: AssistantLimits;
  };
};

export type SceneManifest = SceneSelection & {
  id: string;
};

export async function loadManifest(lessonDir: string): Promise<Manifest> {
  const text = await readFile(join(lessonDir, "lesson.yaml"), "utf8");
  const manifest = parseYaml(text) as unknown;
  validateManifest(manifest);
  return manifest;
}

/** Load only the manifest fields needed for narration-free scene development. */
export async function loadSceneManifest(lessonDir: string): Promise<SceneManifest> {
  const text = await readFile(join(lessonDir, "lesson.yaml"), "utf8");
  const manifest = parseYaml(text) as Partial<SceneManifest> | undefined;
  if (!manifest || typeof manifest.id !== "string") throw new Error('lesson.yaml must define a string "id"');
  validateSceneSelection(manifest);
  return manifest as SceneManifest;
}

function validateSceneSelection(manifest: Record<string, unknown>): void {
  if (manifest.scene !== undefined) {
    nonEmptyString(manifest.scene, 'lesson.yaml field "scene"');
    if (manifest.scenes !== undefined || manifest.initialScene !== undefined) throw new Error('lesson.yaml must use either "scene" or "scenes" with "initialScene", not both');
    return;
  }
  const scenes = object(manifest.scenes, 'lesson.yaml field "scenes"');
  if (!Object.keys(scenes).length) throw new Error('lesson.yaml "scenes" must contain at least one scene');
  for (const [id, path] of Object.entries(scenes)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id) || id === "board") throw new Error(`invalid scene id "${id}"; use letters, digits, hyphens or underscores; "board" is reserved`);
    nonEmptyString(path, `lesson.yaml scenes.${id}`);
  }
  nonEmptyString(manifest.initialScene, 'lesson.yaml field "initialScene"');
  if (!Object.hasOwn(scenes, manifest.initialScene as string)) throw new Error(`unknown initialScene "${String(manifest.initialScene)}"`);
}

/** Select a module for standalone preview or its local cue reference. */
export function sceneFile(manifest: SceneSelection, selected?: string): string {
  if (manifest.scene !== undefined) {
    if (selected) throw new Error("--scene requires a manifest with multiple scenes");
    return manifest.scene;
  }
  const id = selected ?? manifest.initialScene;
  if (!Object.hasOwn(manifest.scenes, id)) throw new Error(`unknown scene "${id}"; available scenes: ${Object.keys(manifest.scenes).join(", ")}`);
  return manifest.scenes[id]!;
}

function validateManifest(value: unknown): asserts value is Manifest {
  const manifest = object(value, "lesson.yaml");
  nonEmptyString(manifest.id, 'lesson.yaml field "id"');
  nonEmptyString(manifest.title, 'lesson.yaml field "title"');
  nonEmptyString(manifest.promise, 'lesson.yaml field "promise"');
  if (
    manifest.tags !== undefined
    && (!Array.isArray(manifest.tags) || manifest.tags.some((value) => typeof value !== "string" || !value.trim()))
  ) {
    throw new Error('lesson.yaml field "tags" must be a list of non-empty strings');
  }
  validateSceneSelection(manifest);

  const defaults = object(manifest.defaults, 'lesson.yaml field "defaults"');
  finiteNumber(defaults.anticipation, 'lesson.yaml field "defaults.anticipation"');
  nonEmptyString(defaults.ease, 'lesson.yaml field "defaults.ease"');
  finiteNumber(defaults.transition, 'lesson.yaml field "defaults.transition"');

  if (manifest.voice !== undefined) {
    throw new Error('lesson.yaml field "voice" was replaced by the optional "tts" section');
  }
  if (manifest.offlineTts !== undefined) {
    const offlineTts = object(manifest.offlineTts, 'lesson.yaml field "offlineTts"');
    if (offlineTts.speed !== undefined) positiveNumber(offlineTts.speed, 'lesson.yaml field "offlineTts.speed"');
  }
  if (manifest.tts !== undefined) {
    const tts = object(manifest.tts, 'lesson.yaml field "tts"');
    if (tts.provider !== "supertonic" && tts.provider !== "elevenlabs" && tts.provider !== "hf-endpoint") {
      throw new Error('lesson.yaml field "tts.provider" must be "supertonic", "elevenlabs", or "hf-endpoint"');
    }
    if (tts.provider === "supertonic") {
      if (tts.voice !== undefined) throw new Error('Supertonic uses a fixed voice; omit "tts.voice"');
    } else {
      nonEmptyString(tts.voice, 'lesson.yaml field "tts.voice"');
    }
    if (tts.provider === "hf-endpoint") {
      optionalString(tts.revision, 'lesson.yaml field "tts.revision"');
      if (tts.speed !== undefined) throw new Error('lesson.yaml field "tts.speed" is not supported by hf-endpoint');
    } else {
      if (tts.speed !== undefined) positiveNumber(tts.speed, 'lesson.yaml field "tts.speed"');
      if (tts.revision !== undefined) throw new Error('lesson.yaml field "tts.revision" is supported only by hf-endpoint');
    }
    if (tts.provider === "elevenlabs") {
      optionalString(tts.model, 'lesson.yaml field "tts.model"');
    } else if (tts.model !== undefined) {
      throw new Error('lesson.yaml field "tts.model" is supported only by ElevenLabs');
    }
  }

  if (manifest.deployment !== undefined) {
    const deployment = object(manifest.deployment, 'lesson.yaml field "deployment"');
    if (deployment.provider !== "huggingface") {
      throw new Error('lesson.yaml field "deployment.provider" must be "huggingface"');
    }
    spaceId(deployment.space, 'lesson.yaml field "deployment.space"');
  }

  if (manifest.assistant !== undefined) {
    const assistant = object(manifest.assistant, 'lesson.yaml field "assistant"');
    if (assistant.provider !== "huggingface") throw new Error('lesson.yaml field "assistant.provider" must be "huggingface"');
    nonEmptyString(assistant.model, 'lesson.yaml field "assistant.model"');
    nonEmptyString(assistant.context, 'lesson.yaml field "assistant.context"');
    optionalBoolean(assistant.startOpen, 'lesson.yaml field "assistant.startOpen"');
    if (!Array.isArray(assistant.commandable) || assistant.commandable.some((value) => typeof value !== "string" || !value)) {
      throw new Error('lesson.yaml field "assistant.commandable" must be a list of parameter names');
    }
    if (assistant.limits === undefined) assistant.limits = DEFAULT_ASSISTANT_LIMITS;
    else validateAssistantLimits(assistant.limits);
  }
}

function validateAssistantLimits(value: unknown): asserts value is AssistantLimits {
  const limits = object(value, 'lesson.yaml field "assistant.limits"');
  const request = object(limits.request, 'lesson.yaml field "assistant.limits.request"');
  positiveInteger(request.bodyBytes, 'lesson.yaml field "assistant.limits.request.bodyBytes"');
  positiveInteger(request.questionCharacters, 'lesson.yaml field "assistant.limits.request.questionCharacters"');
  positiveInteger(request.historyTurns, 'lesson.yaml field "assistant.limits.request.historyTurns"');
  positiveInteger(request.positionCharacters, 'lesson.yaml field "assistant.limits.request.positionCharacters"');

  const response = object(limits.response, 'lesson.yaml field "assistant.limits.response"');
  positiveInteger(response.outputTokens, 'lesson.yaml field "assistant.limits.response.outputTokens"');
  positiveInteger(response.beats, 'lesson.yaml field "assistant.limits.response.beats"');
  positiveInteger(response.beatCharacters, 'lesson.yaml field "assistant.limits.response.beatCharacters"');
  positiveInteger(response.answerCharacters, 'lesson.yaml field "assistant.limits.response.answerCharacters"');
  nonNegativeNumber(response.transitionSeconds, 'lesson.yaml field "assistant.limits.response.transitionSeconds"');

  const rate = object(limits.rate, 'lesson.yaml field "assistant.limits.rate"');
  positiveInteger(rate.browserRequestsPerTenMinutes, 'lesson.yaml field "assistant.limits.rate.browserRequestsPerTenMinutes"');
  positiveInteger(rate.ipRequestsPerTenMinutes, 'lesson.yaml field "assistant.limits.rate.ipRequestsPerTenMinutes"');
  positiveInteger(rate.globalRequestsPerHour, 'lesson.yaml field "assistant.limits.rate.globalRequestsPerHour"');
  positiveInteger(rate.globalRequestsPerDay, 'lesson.yaml field "assistant.limits.rate.globalRequestsPerDay"');
  positiveInteger(rate.concurrentProviderCalls, 'lesson.yaml field "assistant.limits.rate.concurrentProviderCalls"');

  const queue = object(limits.queue, 'lesson.yaml field "assistant.limits.queue"');
  nonNegativeInteger(queue.maxPendingRequests, 'lesson.yaml field "assistant.limits.queue.maxPendingRequests"');
  positiveNumber(queue.waitTimeoutSeconds, 'lesson.yaml field "assistant.limits.queue.waitTimeoutSeconds"');
  positiveNumber(limits.providerTimeoutSeconds, 'lesson.yaml field "assistant.limits.providerTimeoutSeconds"');
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`);
}

function finiteNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
}

function positiveInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function nonNegativeInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

function positiveNumber(value: unknown, name: string): asserts value is number {
  finiteNumber(value, name);
  if (value <= 0) throw new Error(`${name} must be positive`);
}

function nonNegativeNumber(value: unknown, name: string): asserts value is number {
  finiteNumber(value, name);
  if (value < 0) throw new Error(`${name} must be non-negative`);
}

function spaceId(value: unknown, name: string): asserts value is string {
  nonEmptyString(value, name);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(`${name} must use the "namespace/name" form`);
  }
}

function optionalString(value: unknown, name: string): void {
  if (value !== undefined) nonEmptyString(value, name);
}

function optionalBoolean(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
}
