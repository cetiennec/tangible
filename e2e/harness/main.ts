// Browser test harness: instantiate the Player against the built unit-circle
// lesson (tracks/captions/audio inlined by prepare.mjs) and expose it on window
// for Playwright to drive.

import { Player, ScenePreview, PLAYER_CSS, mimeForAudio, preferredAudioSource } from "@tangible/player";
import type { AssistantContext, LessonTracks } from "@tangible/core";
import { scene } from "../fixtures/unit-circle/scenes/scene";
import { scalingScene } from "./scaling-scene";

declare global {
  interface Window {
    __XV_DATA: { tracks: LessonTracks; vtt: string; audio: string[]; assistant: AssistantContext };
    __player: Player;
  }
}

const data = window.__XV_DATA;
const style = document.createElement("style");
style.textContent = PLAYER_CSS;
document.head.append(style);

const mount = document.getElementById("app")!;
const query = new URLSearchParams(location.search);
if (query.has("scaling") || query.has("scene-preview")) document.body.style.margin = "0";
const arrivalMode = query.get("arrival");
const arrival = arrivalMode !== null;
const audio = preferredAudioSource(data.audio);
if (query.has("scene-preview")) {
  const preview = new ScenePreview({ mount, scene: scalingScene });
  preview.start();
} else {
  const player = new Player({
    mount,
    scene: query.has("scaling") ? scalingScene : scene,
    tracks: data.tracks,
    captionsVtt: data.vtt,
    audioSrc: arrival ? [] : [audio],
    audioLoader: arrival
      ? async () => {
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (arrivalMode === "blob") {
            const response = await fetch(audio);
            if (!response.ok) throw new Error(`narration returned ${response.status}`);
            const buffer = await response.arrayBuffer();
            return [URL.createObjectURL(new Blob([buffer], { type: mimeForAudio(audio) }))];
          }
          return [audio];
        }
      : undefined,
    introduction: arrival
      ? { title: "The unit circle" }
      : undefined,
    assistant: { context: data.assistant, startOpen: query.get("assistant") === "open" },
  });
  window.__player = player;
  player.start();
}
