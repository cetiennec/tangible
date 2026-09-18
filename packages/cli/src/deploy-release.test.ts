import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSpaceCard } from "./deploy-release.js";
import type { Manifest } from "./manifest.js";

const manifest = { assistant: undefined } as unknown as Manifest;

async function lessonWith(card: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tangible-card-"));
  await mkdir(join(dir, "space"));
  await writeFile(join(dir, "space", "README.md"), card);
  return dir;
}

const card = (shortDescription: string) => `---
title: "A lesson"
sdk: static
app_file: index.html
short_description: "${shortDescription}"
---
`;

describe("readSpaceCard", () => {
  it("accepts a short description Hugging Face will take", async () => {
    const dir = await lessonWith(card("x".repeat(60)));
    await expect(readSpaceCard(dir, manifest)).resolves.toEqual({ sdk: "static" });
  });

  it("rejects one character too many, rather than failing at upload", async () => {
    // Hugging Face enforces this only when the release is pushed, which is
    // after the whole lesson has been built and narrated.
    const dir = await lessonWith(card("x".repeat(61)));
    await expect(readSpaceCard(dir, manifest)).rejects.toThrow(/at most 60 characters; it is 61/);
  });
});
