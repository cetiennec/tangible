export interface DesignSize {
  width: number;
  height: number;
}

export interface SceneSize extends DesignSize {
  /** Displayed CSS pixels per scene coordinate; never less than one. */
  scale: number;
  /** Canvas backing pixels per scene coordinate, including display density. */
  canvasScale: number;
}

/** Enlarge a composition above its reference size without shrinking small-screen controls. */
export function presentationScale(width: number, height: number, designSize?: DesignSize): number {
  if (!designSize) return 1;
  if (![designSize.width, designSize.height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("scene.designSize width and height must be positive finite numbers");
  }
  return Math.max(1, Math.min(width / designSize.width, height / designSize.height));
}

/** Match HTML magnification and a crisp canvas to the actual player rectangle. */
export function resizeScene(canvas: HTMLCanvasElement, container: HTMLElement, designSize?: DesignSize): SceneSize {
  const bounds = container.getBoundingClientRect();
  const width = bounds.width || 640, height = bounds.height || 360;
  const scale = presentationScale(width, height, designSize);
  // CSS zoom preserves the player's displayed width while scaling its layout units,
  // including native controls. Its canvas is redrawn at the full display resolution.
  container.style.zoom = String(scale);
  const dpr = window.devicePixelRatio || 1;
  const canvasWidth = Math.round(width * dpr), canvasHeight = Math.round(height * dpr);
  if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
  return { width: width / scale, height: height / scale, scale, canvasScale: canvasWidth / (width / scale) };
}
