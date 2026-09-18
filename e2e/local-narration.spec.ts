// Exercise production selection and release validation using cached substitute
// audio, without a model download, native inference, or hosted provider calls.

import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cacheKey, parseScript } from "../packages/compiler/src/index.js";
import { FakeTtsAdapter, SupertonicTtsAdapter } from "../packages/tts/src/index.js";

const CLI = resolve("packages/cli/dist/index.js");

test("local production builds and passes release checks without speech credentials", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The command workflow needs only one browser engine.");
  const root = await mkdtemp(join(tmpdir(), "tangible-local-production-"));
  const dir = join(root, "lesson");
  const env = {
    ...process.env,
    ELEVENLABS_API_KEY: "", HF_TTS_TOKEN: "", HF_TOKEN: "", TTS_ENDPOINT_URL: "",
    TANGIBLE_SUPERTONIC_MODEL_DIR: join(root, "missing-model"),
  };
  const lesson = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args, "--lesson", dir], { cwd: root, env, encoding: "utf8" });
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  };

  try {
    expect(lesson("new", "local-production").status).toBe(0);
    const manifestPath = join(dir, "lesson.yaml");
    const base = await readFile(manifestPath, "utf8");
    await writeFile(manifestPath, base + "tts: { provider: supertonic, speed: 1.2 }\n");

    // Seed the selected local voice's cache with a deterministic substitute.
    // A wrong provider, voice, or speed will miss and fail on missing-model.
    const text = parseScript(await readFile(join(dir, "script.md"), "utf8")).narration;
    const result = await new FakeTtsAdapter().synthesize({ text, voice: "test" });
    const key = cacheKey(new SupertonicTtsAdapter(), "supertonic-3-speaker-0", text, 1.2);
    const cache = join(dir, ".cache", "tts");
    await mkdir(cache, { recursive: true });
    const { audio, ...timing } = result;
    await writeFile(join(cache, `${key}.audio`), audio);
    await writeFile(join(cache, `${key}.json`), JSON.stringify(timing));

    const checked = lesson("check");
    expect(checked.status, checked.stderr).toBe(0);
    const built = lesson("build", "--bundle");
    expect(built.status, built.stderr).toBe(0);
    expect(built.stderr).toContain("word timing is estimated");
    const tracks = JSON.parse(await readFile(join(dir, "build", "lesson", "tracks.json"), "utf8"));
    expect(tracks.audio.src).toEqual(["audio.webm", "audio.m4a"]);
    expect((await readFile(join(dir, "build", "site", "audio.webm"))).length).toBeGreaterThan(0);

    const prepared = lesson("deploy", "--prepare", "--space", "example/local-production");
    expect(prepared.status, prepared.stderr).toBe(0);
    await writeFile(join(root, ".gitignore"), "build/\n.cache/\n");
    git("init", "--quiet", "--template=");
    git("add", ".");
    git("-c", "user.name=Tangible test", "-c", "user.email=test@example.invalid",
      "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "commit", "--quiet", "-m", "Test local narration");
    const released = lesson("deploy", "--dry-run", "--create");
    expect(released.status, released.stderr).toBe(0);
    expect(released.stderr).toContain("dry run: would create privately and deploy example/local-production");
    const offlineRelease = lesson("deploy", "--dry-run", "--offline");
    expect(offlineRelease.status).toBe(1);
    expect(offlineRelease.stderr).toContain("configured production voice");

    await writeFile(manifestPath, base + "tts: { provider: elevenlabs, voice: test }\n");
    const missingKey = lesson("build");
    expect(missingKey.status).toBe(1);
    expect(missingKey.stderr).toContain("ELEVENLABS_API_KEY is not set");
    expect(missingKey.stderr).not.toContain("using silent placeholder");
    expect(lesson("build", "--silent").status).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
