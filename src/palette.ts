export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function rgbCss(color: RGB, alpha = 1): string {
  const r = Math.round(color[0] * 255);
  const g = Math.round(color[1] * 255);
  const b = Math.round(color[2] * 255);
  if (alpha < 1) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  return `rgb(${r}, ${g}, ${b})`;
}

export type Sky = {
  skyTop: RGB;
  skyMid: RGB;
  skyLow: RGB;
  seaDeep: RGB;
  seaShallow: RGB;
  foam: RGB;
  sandDry: RGB;
  sandWet: RGB;
  sandShade: RGB;
  sunCore: RGB;
  sunGlow: RGB;
  cloud: RGB;
};

const DAY: Sky = {
  skyTop: hexToRgb("#6eafd6"),
  skyMid: hexToRgb("#f2c48a"),
  skyLow: hexToRgb("#f7d7a8"),
  seaDeep: hexToRgb("#1a6e86"),
  seaShallow: hexToRgb("#3eaea8"),
  foam: hexToRgb("#fff6ea"),
  sandDry: hexToRgb("#f3d7a4"),
  sandWet: hexToRgb("#8f6840"),
  sandShade: hexToRgb("#6e4e32"),
  sunCore: hexToRgb("#fff1c4"),
  sunGlow: hexToRgb("#ffb15a"),
  cloud: hexToRgb("#fff6ee"),
};

const DUSK: Sky = {
  skyTop: hexToRgb("#3a3f78"),
  skyMid: hexToRgb("#e36b62"),
  skyLow: hexToRgb("#f0a06a"),
  seaDeep: hexToRgb("#24365c"),
  seaShallow: hexToRgb("#c46b62"),
  foam: hexToRgb("#fff0e6"),
  sandDry: hexToRgb("#e7b98a"),
  sandWet: hexToRgb("#7a5340"),
  sandShade: hexToRgb("#5c4030"),
  sunCore: hexToRgb("#ffe0b0"),
  sunGlow: hexToRgb("#ff7a45"),
  cloud: hexToRgb("#f3c4b4"),
};

const KEYS = [
  "skyTop",
  "skyMid",
  "skyLow",
  "seaDeep",
  "seaShallow",
  "foam",
  "sandDry",
  "sandWet",
  "sandShade",
  "sunCore",
  "sunGlow",
  "cloud",
] as const;

export function skyAt(sun: number): Sky {
  const out = {} as Sky;
  for (const key of KEYS) out[key] = mixRgb(DAY[key], DUSK[key], sun);
  return out;
}

export function themeHex(sun: number): string {
  const color = mixRgb(hexToRgb("#e39a58"), hexToRgb("#c45d62"), sun);
  const r = Math.round(color[0] * 255).toString(16).padStart(2, "0");
  const g = Math.round(color[1] * 255).toString(16).padStart(2, "0");
  const b = Math.round(color[2] * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}
