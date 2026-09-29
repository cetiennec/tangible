// `lesson video -o lesson.mp4` — export the built site as a video. Headless Chromium
// draws the lesson one frame at a time in export mode, FFmpeg encodes the frames,
// and the lesson's own narration is laid underneath with silence wherever a pause
// checkpoint was held on screen. Frames are rendered, not recorded, so a slow scene
// only makes the export slower, never choppier.

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staticServer } from "./frame.js";

export interface VideoOptions {
  out: string;
  size?: string; // "1920x1080": the layout size, in CSS pixels
  scale?: number; // pixels per CSS pixel: 2 renders a 1920x1080 layout as a 3840x2160 video
  fps?: number;
  hold?: number; // seconds each pause checkpoint stays on screen
  captions?: boolean;
  from?: number; // lesson seconds
  to?: number;
  onProgress?: (message: string) => void;
}

/** A checkpoint held on screen: at this lesson time, for this long. */
export interface Hold {
  at: number;
  seconds: number;
}

export type SoundtrackPiece = { start: number; end: number } | { silence: number };

/** The narration in video order: stretches of lesson audio, with silence under each held checkpoint. */
export function soundtrackPlan(from: number, to: number, holds: Hold[]): SoundtrackPiece[] {
  const plan: SoundtrackPiece[] = [];
  let cursor = from;
  for (const hold of [...holds].sort((a, b) => a.at - b.at)) {
    if (hold.at > cursor) plan.push({ start: cursor, end: hold.at });
    plan.push({ silence: hold.seconds });
    cursor = Math.max(cursor, hold.at);
  }
  if (to > cursor) plan.push({ start: cursor, end: to });
  return plan;
}

/** FFmpeg filter building the soundtrack from input 1, the lesson audio. */
export function soundtrackFilter(plan: SoundtrackPiece[]): string {
  const pieces = plan.map((piece, i) =>
    "silence" in piece
      ? `anullsrc=r=48000:cl=mono,atrim=duration=${piece.silence.toFixed(3)}[p${i}]`
      : `[1:a]atrim=start=${piece.start.toFixed(3)}:end=${piece.end.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=mono[p${i}]`,
  );
  return `${pieces.join(";")};${plan.map((_, i) => `[p${i}]`).join("")}concat=n=${plan.length}:v=0:a=1[a]`;
}

interface ExportFrame {
  t: number;
  paused: boolean;
  scene?: string;
}

type ExportWindow = typeof globalThis & { __tangibleExport?: { step(t: number): Promise<ExportFrame>; resume(): void } };

export async function renderVideo(siteDir: string, opts: VideoOptions): Promise<void> {
  const tracks = JSON.parse(readFileSync(join(siteDir, "tracks.json"), "utf8")) as { duration: number; audio: { src: string[] } };
  const fps = opts.fps ?? 30;
  const holdFrames = Math.round((opts.hold ?? 3) * fps);
  const from = opts.from ?? 0;
  const to = Math.min(opts.to ?? tracks.duration, tracks.duration);
  if (!(to > from)) throw new Error(`nothing to export between ${from} s and ${to} s`);
  const audio = tracks.audio.src.map((src) => join(siteDir, src)).find((file) => existsSync(file));
  if (!audio) throw new Error("the bundle has no narration audio");
  const [width, height] = (opts.size ?? "1920x1080").split("x").map(Number);

  const dir = mkdtempSync(join(tmpdir(), "tangible-video-"));
  const pictures = join(dir, "pictures.mp4");
  const server = staticServer(siteDir);
  const port = await new Promise<number>((res) => server.listen(0, "127.0.0.1", () => res((server.address() as AddressInfo).port)));
  // Full Chromium in its new headless mode can draw WebGL on the GPU; the default
  // headless shell falls back to software rendering, some twenty times slower.
  const browser = await chromium.launch({ channel: "chromium" });
  const holds: Hold[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: width!, height: height! }, deviceScaleFactor: opts.scale ?? 1 });
    await page.goto(`http://127.0.0.1:${port}/?export&t=${from}${opts.captions ? "&captions" : ""}`);
    await page.waitForFunction(() => (globalThis as ExportWindow).__tangibleExport !== undefined);
    await page.waitForLoadState("networkidle");
    // ?t seeks and pauses; the export starts playing from there.
    await page.evaluate(() => (globalThis as ExportWindow).__tangibleExport!.resume());

    const encoder = spawn("ffmpeg", [
      "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", pictures,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    const encoded = new Promise<void>((resolve, reject) => {
      encoder.on("error", reject);
      encoder.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code} while encoding frames`))));
    });

    // Lesson time advances one frame per shown frame, except while a checkpoint is
    // held: those frames repeat its moment, and the soundtrack gets silence there.
    let played = 0;
    let held = 0;
    let scene: string | undefined;
    let reported = -Infinity;
    const step = (t: number) => page.evaluate((at) => (globalThis as ExportWindow).__tangibleExport!.step(at), t);
    while (from + played / fps < to) {
      const t = from + played / fps;
      let frame = await step(t);
      if (frame.scene !== scene) {
        // A scene fetches its own assets, such as 3D models, when it first appears.
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        frame = await step(t);
        scene = frame.scene;
      }
      const image = await page.screenshot({ type: "jpeg", quality: 92 });
      if (!encoder.stdin!.write(image)) await new Promise((resolve) => encoder.stdin!.once("drain", resolve));
      if (frame.paused) {
        if (held === 0) holds.push({ at: t, seconds: holdFrames / fps });
        held += 1;
        if (held >= holdFrames) {
          await page.evaluate(() => (globalThis as ExportWindow).__tangibleExport!.resume());
          held = 0;
        }
        continue;
      }
      played += 1;
      if (t - reported >= 30) {
        opts.onProgress?.(`exporting: ${Math.round(t - from)} s of ${Math.round(to - from)} s`);
        reported = t;
      }
    }
    encoder.stdin!.end();
    await encoded;
  } finally {
    await browser.close();
    server.close();
  }

  try {
    const result = spawnSync("ffmpeg", [
      "-y", "-loglevel", "error", "-i", pictures, "-i", audio,
      "-filter_complex", soundtrackFilter(soundtrackPlan(from, to, holds)),
      "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", opts.out,
    ], { encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`ffmpeg could not add the narration: ${result.stderr.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
