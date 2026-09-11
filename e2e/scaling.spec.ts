import { expect, test, type Page } from "@playwright/test";

async function size(page: Page) {
  return page.locator("canvas").evaluate(canvas => JSON.parse(canvas.dataset.size!));
}

for (const mode of ["scaling", "scene-preview"]) {
  test(`${mode} scales the whole composition and keeps pointer coordinates aligned`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?${mode}`);
    await expect(page.locator("canvas")).toHaveAttribute("data-size");
    const label = page.locator(".scaling-label"), input = page.getByRole("slider", { name: "Point position" });
    const originalLabel = (await label.boundingBox())!;
    const originalInput = (await input.boundingBox())!;

    // Resizing while paused must redraw even though the logical scene stays 1280 wide.
    for (const [index, width] of [2560, 3840, 1920].entries()) {
      await page.setViewportSize({ width, height: 2400 });
      const player = (await page.locator(".xv-player").boundingBox())!;
      const scale = player.width / 1280;
      await expect.poll(async () => (await size(page)).scale).toBeCloseTo(scale, 2);
      const enlargedLabel = (await label.boundingBox())!;
      const enlargedInput = (await input.boundingBox())!;
      expect(enlargedLabel.width / originalLabel.width).toBeCloseTo(scale, 1);
      expect(enlargedInput.height / originalInput.height).toBeCloseTo(scale, 1);
      expect(enlargedLabel.x - player.x).toBeCloseTo(100 * scale, 0);

      // Inspect a canvas stroke: it grows with the DOM and uses physical display pixels.
      const pixels = await page.locator("canvas").evaluate(canvas => {
        const { canvasScale } = JSON.parse(canvas.dataset.size!);
        const image = canvas.getContext("2d")!.getImageData(Math.round(110 * canvasScale), Math.round(195 * canvasScale), 1, Math.ceil(12 * canvasScale));
        let painted = 0;
        for (let i = 3; i < image.data.length; i += 4) if (image.data[i]! > 0) painted++;
        return { painted, canvasScale, backingWidth: canvas.width, displayWidth: canvas.getBoundingClientRect().width, dpr: devicePixelRatio };
      });
      expect(Math.abs(pixels.painted - 2 * pixels.canvasScale)).toBeLessThanOrEqual(2);
      expect(pixels.backingWidth / pixels.displayWidth).toBeCloseTo(pixels.dpr, 2);
      const targetValue = 2 + index;
      await page.mouse.click(player.x + (100 + targetValue * 40) * scale, player.y + 260 * scale);
      // Browser pointer events may round a fractional CSS position to a whole pixel.
      await expect.poll(async () => Number(await input.inputValue())).toBeCloseTo(targetValue, 1);
      const beforeKey = Number(await input.inputValue());
      await input.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(async () => Number(await input.inputValue())).toBeCloseTo(beforeKey + 0.01, 3);
    }

    await page.setViewportSize({ width: 667, height: 375 });
    await expect.poll(async () => (await size(page)).scale).toBe(1);
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
}

test("scaled player reserves space for captions, chrome, and the assistant", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/?scaling");
  await expect(page.locator("canvas")).toHaveAttribute("data-size");
  await page.locator(".xv-assistant-toggle").click();
  await page.locator(".xv-captions-toggle").click();
  await page.evaluate(() => {
    const player = (window as any).__player;
    player.clock.seek(0.2); player.driver.tick();
  });
  const player = (await page.locator(".xv-player").boundingBox())!;
  const chrome = (await page.locator(".xv-chrome").boundingBox())!;
  const captions = (await page.locator(".xv-captions").boundingBox())!;
  const assistant = (await page.locator(".xv-assistant").boundingBox())!;
  const scale = (await size(page)).scale;
  expect(scale).toBeGreaterThan(1);
  expect(chrome.height).toBeCloseTo(52 * scale, 0);
  expect(captions.y + captions.height).toBeLessThanOrEqual(chrome.y);
  expect(assistant.y).toBeCloseTo(player.y + player.height, 0);
  expect(assistant.y + assistant.height).toBeLessThanOrEqual(1440);
});

test("high-density displays retain sharp canvas rendering in an embedded player", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("http://localhost:5178/?scaling");
  await expect(page.locator("canvas")).toHaveAttribute("data-size");
  await page.locator("#app").evaluate(mount => { mount.style.width = "1920px"; });
  await expect.poll(async () => (await size(page)).scale).toBe(1.5);
  const result = await page.locator("canvas").evaluate(canvas => ({ width: canvas.width, height: canvas.height, size: JSON.parse(canvas.dataset.size!) }));
  expect(result).toMatchObject({ width: 3840, height: 2160, size: { width: 1280, height: 720, scale: 1.5, canvasScale: 3 } });
  const player = (await page.locator(".xv-player").boundingBox())!;
  await page.mouse.click(player.x + 180 * 1.5, player.y + 260 * 1.5);
  await expect.poll(async () => Number(await page.getByRole("slider", { name: "Point position" }).inputValue())).toBeCloseTo(2, 1);
  await context.close();
});
