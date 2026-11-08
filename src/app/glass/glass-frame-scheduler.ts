/**
 * Coalesces preview draw requests into one animation frame. The latest request
 * always wins, so rapid timeline updates never starve drawing.
 */
export type GlassFrameScheduler = Readonly<{
  cancel: () => void;
  request: (draw: () => void) => void;
}>;

export function createGlassFrameScheduler(): GlassFrameScheduler {
  let pending: (() => void) | null = null;
  let handle: number | null = null;
  const flush = () => {
    handle = null;
    const draw = pending;
    pending = null;
    draw?.();
  };
  return Object.freeze({
    cancel() {
      pending = null;
      if (handle !== null) cancelAnimationFrame(handle);
      handle = null;
    },
    request(draw: () => void) {
      pending = draw;
      if (handle === null) handle = requestAnimationFrame(flush);
    },
  });
}
