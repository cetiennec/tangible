import { test, expect, type Page } from "@playwright/test";
import type { LessonTracks } from "@tangible/core";

async function openLesson(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/multi/index.html", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await page.evaluate(() => window.__player.clock.pause());
  const tracks = await (await page.request.get("/multi/tracks.json")).json() as LessonTracks;
  return { errors, tracks };
}

async function seek(page: Page, t: number) {
  await page.evaluate((time) => {
    const player = window.__player;
    player.clock.pause(); player.clock.seek(time); player.driver.tick();
  }, t);
}

test("independent controls and repeated seeks recreate the correct scene", async ({ page }) => {
  const { tracks, errors } = await openLesson(page);
  const graphTime = tracks.chapters[1]!.t + 1;
  const returnTime = tracks.chapters[2]!.t + 1;
  await seek(page, 1);
  const slider = page.getByRole("slider", { name: "Angle theta" });
  await slider.fill("1");
  await expect.poll(() => page.evaluate(() => window.__player.store.plain["circle.theta"])).toBe(1);
  await seek(page, graphTime);
  await expect(page.getByRole("heading", { name: "Cosine as a graph", exact: true })).toBeVisible();
  await expect(slider).toHaveValue("0");
  await slider.fill("2");
  await expect.poll(() => page.evaluate(() => window.__player.store.plain["cosine.theta"])).toBe(2);
  await slider.focus(); await page.keyboard.press("ArrowRight");
  await expect.poll(() => page.evaluate(() => Number(window.__player.store.plain["cosine.theta"])) ).toBeGreaterThan(2);
  for (const t of [returnTime, graphTime, 1, returnTime, graphTime]) {
    await seek(page, t);
    await expect(page.locator(".trig-scene")).toHaveCount(1);
    await expect(page.locator(".xv-overlay style")).toHaveCount(1);
    await expect(page.locator("canvas")).toHaveCount(1);
  }
  await expect(slider).toHaveValue("0");
  expect(errors).toEqual([]);
});

test("the graph remains visible at its pause and playback resumes into the circle", async ({ page }) => {
  const { tracks, errors } = await openLesson(page);
  await seek(page, tracks.pauses[0]!.t - 0.08);
  await page.evaluate(() => window.__player.clock.play());
  await expect.poll(() => page.evaluate(() => window.__player.pauseGate.activePrompt)).toContain("explore the curve");
  await expect.poll(() => page.evaluate(() => window.__player.clock.playing)).toBe(false);
  await expect(page.getByRole("heading", { name: "Cosine as a graph", exact: true })).toBeVisible();
  await page.evaluate(() => window.__player.clock.play());
  await expect(page.getByRole("heading", { name: "The unit circle", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("both scenes remain usable at desktop and phone landscape sizes", async ({ page }, testInfo) => {
  const { tracks, errors } = await openLesson(page);
  await page.getByRole("button", { name: "Show captions" }).click();
  for (const [width, height] of [[1200, 800], [667, 375], [844, 390], [896, 414]]) {
    await page.setViewportSize({ width: width!, height: height! });
    for (const chapter of [0, 1]) {
      await seek(page, tracks.chapters[chapter]!.t + 1);
      const slider = page.getByRole("slider", { name: "Angle theta" });
      await expect(slider).toBeVisible();
      const bounds = await slider.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThan(height!);
      await slider.fill("3.141");
      await expect(page.locator(".trig-controls output")).toContainText("180°");
      await page.screenshot({ path: testInfo.outputPath(`${width}-${chapter}.png`) });
    }
  }
  expect(errors).toEqual([]);
});
