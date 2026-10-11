/** Horizon, as a fraction of the screen height. Sand begins here. */
export const HORIZON = 0.33;

export type View = {
  w: number;
  h: number;
};

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function sandTop(view: View): number {
  return view.h * HORIZON;
}

export function sandSpan(view: View): number {
  return Math.max(1, view.h - sandTop(view));
}

export function sandToScreen(u: number, v: number, view: View): { x: number; y: number } {
  return {
    x: u * view.w,
    y: sandTop(view) + v * sandSpan(view),
  };
}

/** Map a pointer to sand coordinates. v below 0 is the sea above the beach. */
export function screenToSand(x: number, y: number, view: View): { u: number; v: number } | null {
  if (view.w <= 0 || view.h <= 0) return null;
  if (x < -12 || x > view.w + 12) return null;
  if (y < sandTop(view) - view.h * 0.12 || y > view.h + 8) return null;
  return {
    u: x / view.w,
    v: (y - sandTop(view)) / sandSpan(view),
  };
}

export function pixelRatio(): number {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cap = coarse ? 1.5 : 1.75;
  return Math.min(window.devicePixelRatio || 1, cap);
}
