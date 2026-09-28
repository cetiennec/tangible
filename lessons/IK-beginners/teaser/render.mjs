// Render the teaser to out/teaser.mp4: make the music if it is missing, extract each
// shot's frames from its clip with FFmpeg, draw every frame of teaser.html in
// headless Chromium, and encode the frames with the music.
//
// Run from anywhere inside the repository:  node lessons/IK-beginners/teaser/render.mjs

import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out", "teaser.mp4");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: here, stdio: ["ignore", "inherit", "inherit"] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

if (!existsSync(join(here, "music.wav"))) {
  run("uv", ["run", "-q", "--with", "numpy", "--with", "scipy", "--with", "soundfile", "python", "make_music.py", "music.wav"]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(join(here, "teaser.html")).href);
  const { fps, seconds, shots } = await page.evaluate(() => window.TEASER);

  for (const { clip, trim, seconds: length } of shots) {
    const dir = join(here, "frames", clip);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    run("ffmpeg", ["-v", "error", "-ss", String(trim), "-i", join("clips", `${clip}.mp4`), "-t", String(length + 0.1),
      "-vf", `fps=${fps}`, "-q:v", "2", join(dir, "%04d.jpg")]);
  }

  mkdirSync(dirname(out), { recursive: true });
  const encoder = spawn("ffmpeg", [
    "-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-", "-i", "music.wav",
    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
  ], { cwd: here, stdio: ["pipe", "inherit", "inherit"] });
  const encoded = new Promise((resolve, reject) => {
    encoder.on("error", reject);
    encoder.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });

  const frames = Math.round(seconds * fps);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.renderAt(t), f / fps);
    const image = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!encoder.stdin.write(image)) await new Promise((resolve) => encoder.stdin.once("drain", resolve));
  }
  encoder.stdin.end();
  await encoded;
  console.log(`rendered ${frames} frames → ${out}`);
} finally {
  await browser.close();
}
