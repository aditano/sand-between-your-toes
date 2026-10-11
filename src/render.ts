import type { BeachLoot, CollectKind, CoinVariant, ShellVariant } from "./collectibles";
import { rgbCss, skyAt, type Sky } from "./palette";
import type { Penguin } from "./penguins";
import { sandToScreen, sandTop, type View } from "./project";
import type { ShoreSim } from "./sim";

export type ShorePainter = {
  resize: (view: View, dpr: number) => void;
  draw: (sim: ShoreSim, view: View, reduceMotion: boolean) => void;
};

function shadeSand(
  height: Float32Array,
  wet: Float32Array,
  cols: number,
  rows: number,
  x: number,
  y: number,
  sky: Sky,
): [number, number, number] {
  const i = y * cols + x;
  const h = height[i];
  const w = wet[i];
  const left = height[y * cols + Math.max(0, x - 1)];
  const right = height[y * cols + Math.min(cols - 1, x + 1)];
  const up = height[Math.max(0, y - 1) * cols + x];
  const down = height[Math.min(rows - 1, y + 1) * cols + x];
  const nx = (left - right) * 4.5;
  const ny = (up - down) * 4.5;
  const light = Math.max(0.35, Math.min(1.15, 0.72 + nx * 0.35 - ny * 0.55 + (h - 0.45) * 0.5));
  const dry = sky.sandDry;
  const damp = sky.sandWet;
  const shade = sky.sandShade;
  const baseR = dry[0] + (damp[0] - dry[0]) * w;
  const baseG = dry[1] + (damp[1] - dry[1]) * w;
  const baseB = dry[2] + (damp[2] - dry[2]) * w;
  const shadow = Math.max(0, 0.55 - h) * 1.4;
  return [
    Math.min(1, (baseR * (1 - shadow) + shade[0] * shadow) * light),
    Math.min(1, (baseG * (1 - shadow) + shade[1] * shadow) * light),
    Math.min(1, (baseB * (1 - shadow) + shade[2] * shadow) * light),
  ];
}

function shellTint(variant: ShellVariant, sky: Sky): [number, number, number] {
  switch (variant) {
    case "cockle":
      return sky.foam;
    case "spiral":
      return sky.sunGlow;
    case "scallop":
      return [0.95, 0.72, 0.62];
    case "conch":
      return [0.9, 0.55, 0.42];
    case "pearl":
      return [0.92, 0.95, 0.98];
    default: {
      const leftover: never = variant;
      return leftover;
    }
  }
}

function coinTint(variant: CoinVariant): [number, number, number] {
  switch (variant) {
    case "copper":
      return [0.78, 0.45, 0.22];
    case "silver":
      return [0.82, 0.86, 0.9];
    case "gold":
      return [0.95, 0.78, 0.28];
    default: {
      const leftover: never = variant;
      return leftover;
    }
  }
}

export function createPainter(canvas: HTMLCanvasElement): ShorePainter | null {
  const maybeCtx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!maybeCtx) return null;
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let dpr = 1;
  const sandCanvas = document.createElement("canvas");
  let sandCtx: CanvasRenderingContext2D | null = sandCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  let pixels: ImageData | null = null;
  let lastCols = 0;
  let lastRows = 0;

  function ensureSandBuffer(cols: number, rows: number): ImageData | null {
    if (sandCanvas.width !== cols || sandCanvas.height !== rows) {
      sandCanvas.width = cols;
      sandCanvas.height = rows;
      sandCtx = sandCanvas.getContext("2d", { willReadFrequently: true });
    }
    if (!sandCtx) return null;
    if (!pixels || lastCols !== cols || lastRows !== rows) {
      pixels = sandCtx.createImageData(cols, rows);
      lastCols = cols;
      lastRows = rows;
    }
    return pixels;
  }

  function paintSky(view: View, sky: Sky, sun: number, time: number, reduceMotion: boolean): void {
    const top = sandTop(view);
    const grad = ctx.createLinearGradient(0, 0, 0, top + 8);
    grad.addColorStop(0, rgbCss(sky.skyTop));
    grad.addColorStop(0.55, rgbCss(sky.skyMid));
    grad.addColorStop(1, rgbCss(sky.skyLow));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, top + 10);

    const sunX = view.w * (0.72 - sun * 0.18);
    const sunY = top * (0.42 + sun * 0.28);
    const glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, view.w * 0.28);
    glow.addColorStop(0, rgbCss(sky.sunCore, 0.95));
    glow.addColorStop(0.18, rgbCss(sky.sunGlow, 0.55));
    glow.addColorStop(0.45, rgbCss(sky.sunGlow, 0.14));
    glow.addColorStop(1, rgbCss(sky.sunGlow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, view.w, top + 20);
    ctx.beginPath();
    ctx.fillStyle = rgbCss(sky.sunCore);
    ctx.arc(sunX, sunY, Math.max(10, view.w * 0.028), 0, Math.PI * 2);
    ctx.fill();

    const drift = reduceMotion ? 0 : time * 8;
    for (let i = 0; i < 4; i += 1) {
      const cx = ((i * 0.27 + 0.1) * view.w + drift * (0.4 + i * 0.1)) % (view.w + 120) - 60;
      const cy = top * (0.18 + (i % 3) * 0.12);
      const w = view.w * (0.12 + (i % 2) * 0.05);
      ctx.fillStyle = rgbCss(sky.cloud, 0.22 - sun * 0.06);
      ctx.beginPath();
      ctx.ellipse(cx, cy, w, w * 0.28, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + w * 0.35, cy + 4, w * 0.55, w * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function paintSea(view: View, sim: ShoreSim, sky: Sky): void {
    const top = sandTop(view);
    const seaTop = Math.max(0, top - view.h * 0.14);
    const foamY = top + Math.max(0, sim.waveFront) * (view.h - top);
    const seaBottom = Math.max(top + 8, foamY + 22);
    const grad = ctx.createLinearGradient(0, seaTop, 0, seaBottom);
    grad.addColorStop(0, rgbCss(sky.seaDeep));
    grad.addColorStop(0.55, rgbCss(sky.seaShallow));
    grad.addColorStop(1, rgbCss(sky.sandWet, 0.55));
    ctx.fillStyle = grad;
    ctx.fillRect(0, seaTop, view.w, seaBottom - seaTop);

    ctx.strokeStyle = rgbCss(sky.foam, 0.4 + sim.foam * 0.4);
    ctx.lineWidth = 3 + sim.foam * 4;
    ctx.beginPath();
    for (let x = 0; x <= view.w; x += 8) {
      const wobble =
        Math.sin(x * 0.03 + sim.wavePhase * 2.1) * 5 +
        Math.sin(x * 0.011 + sim.time * 1.4) * 3;
      const y = foamY + wobble;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = rgbCss(sky.foam, 0.14 + sim.foam * 0.14);
    ctx.beginPath();
    ctx.moveTo(0, foamY - 8);
    for (let x = 0; x <= view.w; x += 10) {
      const y = foamY + Math.sin(x * 0.04 + sim.wavePhase * 2.4) * 6 - 4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(view.w, foamY + 18);
    ctx.lineTo(0, foamY + 18);
    ctx.closePath();
    ctx.fill();
  }

  function paintSandField(sim: ShoreSim, view: View, sky: Sky): void {
    const data = ensureSandBuffer(sim.cols, sim.rows);
    if (!data || !sandCtx) return;
    const { cols, rows, height, wet } = sim;
    const buf = data.data;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const [r, g, b] = shadeSand(height, wet, cols, rows, x, y, sky);
        const p = (y * cols + x) * 4;
        buf[p] = Math.round(r * 255);
        buf[p + 1] = Math.round(g * 255);
        buf[p + 2] = Math.round(b * 255);
        buf[p + 3] = 255;
      }
    }
    sandCtx.putImageData(data, 0, 0);
    const top = sandTop(view);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(sandCanvas, 0, top - 2, view.w, view.h - top + 4);
  }

  function paintFoot(u: number, v: number, radius: number, bury: number, view: View): void {
    const p = sandToScreen(u, v, view);
    const scale = Math.min(view.w, view.h);
    const rx = radius * scale * 0.55;
    const ry = radius * scale * 0.38;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-0.2);
    ctx.fillStyle = `rgba(55, 36, 24, ${0.12 + bury * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      const toeX = -rx * 0.55 + i * rx * 0.28;
      const toeY = -ry * 0.85;
      ctx.beginPath();
      ctx.ellipse(toeX, toeY, rx * 0.16, ry * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (bury > 0.35) {
      ctx.fillStyle = `rgba(243, 215, 164, ${0.15 + bury * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(0, ry * 0.1, rx * 0.85, ry * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function paintShellLoot(item: BeachLoot, view: View, sky: Sky, alpha: number): void {
    const p = sandToScreen(item.u, item.v, view);
    const s = item.size * Math.min(view.w, view.h) * (1 + item.spark * 0.8);
    const variant = item.variant as ShellVariant;
    ctx.save();
    ctx.translate(p.x, p.y - item.spark * 18);
    ctx.rotate(item.angle + item.wash * 0.4);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgbCss(shellTint(variant, sky), 0.75 + alpha * 0.2);
    if (variant === "spiral" || variant === "conch") {
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, s * 0.55);
      ctx.quadraticCurveTo(-s * 1.1, 0, 0, -s * 0.7);
      ctx.quadraticCurveTo(s * 1.05, 0, s * 0.25, s * 0.55);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, s * (variant === "scallop" ? 1.15 : 1), s * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      if (variant === "scallop") {
        ctx.strokeStyle = `rgba(90, 55, 35, ${0.28 * alpha})`;
        ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i += 1) {
          ctx.beginPath();
          ctx.moveTo(0, s * 0.15);
          ctx.quadraticCurveTo(i * s * 0.35, -s * 0.1, i * s * 0.55, -s * 0.45);
          ctx.stroke();
        }
      }
      if (variant === "pearl") {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function paintCoinLoot(item: BeachLoot, view: View, alpha: number): void {
    const p = sandToScreen(item.u, item.v, view);
    const s = item.size * Math.min(view.w, view.h) * (1 + item.spark * 0.7);
    const tint = coinTint(item.variant as CoinVariant);
    ctx.save();
    ctx.translate(p.x, p.y - item.spark * 20);
    ctx.rotate(item.angle);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgbCss(tint, 0.92);
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(70, 45, 20, ${0.35 * alpha})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 240, 200, ${0.35 * alpha})`;
    ctx.beginPath();
    ctx.arc(-s * 0.2, -s * 0.2, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function paintCastleLoot(item: BeachLoot, view: View, alpha: number): void {
    const p = sandToScreen(item.u, item.v, view);
    const fort = item.variant === "fort";
    const s = item.size * Math.min(view.w, view.h) * (fort ? 1.35 : 1) * (1 + item.spark * 0.5);
    ctx.save();
    ctx.translate(p.x, p.y - item.spark * 16);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#e2bc82";
    ctx.fillRect(-s, -s * 1.05, s * 2, s * 1.25);
    ctx.fillRect(-s * 1.1, -s * 1.4, s * 0.5, s * 0.4);
    ctx.fillRect(s * 0.6, -s * 1.4, s * 0.5, s * 0.4);
    if (fort) ctx.fillRect(-s * 0.25, -s * 1.7, s * 0.5, s * 0.45);
    ctx.fillStyle = "rgba(90, 55, 30, 0.35)";
    ctx.fillRect(-s * 0.2, -s * 0.25, s * 0.4, s * 0.45);
    ctx.restore();
  }

  function paintLoot(item: BeachLoot, view: View, sky: Sky): void {
    if (item.buried > 0.88 && item.spark <= 0) return;
    const alpha = item.spark > 0 ? item.spark : Math.max(0.15, 1 - item.buried);
    if (item.buried > 0.55 && item.spark <= 0) {
      // Hint of a bump under the sand.
      const p = sandToScreen(item.u, item.v, view);
      const s = item.size * Math.min(view.w, view.h) * 0.7;
      ctx.fillStyle = `rgba(120, 80, 45, ${(0.88 - item.buried) * 0.55})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s * 1.2, s * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    switch (item.kind) {
      case "shell":
        paintShellLoot(item, view, sky, alpha);
        break;
      case "coin":
        paintCoinLoot(item, view, alpha);
        break;
      case "castle":
        paintCastleLoot(item, view, alpha);
        break;
      default: {
        const leftover: never = item.kind;
        void leftover;
      }
    }
  }

  function paintBuiltCastle(u: number, v: number, height: number, life: number, view: View): void {
    const p = sandToScreen(u, v, view);
    const s = Math.min(view.w, view.h) * 0.035 * height;
    ctx.save();
    ctx.globalAlpha = Math.max(0.2, life);
    ctx.fillStyle = "#e8c48a";
    ctx.fillRect(p.x - s, p.y - s * 1.2, s * 2, s * 1.4);
    ctx.fillRect(p.x - s * 1.15, p.y - s * 1.55, s * 0.55, s * 0.45);
    ctx.fillRect(p.x + s * 0.55, p.y - s * 1.55, s * 0.55, s * 0.45);
    ctx.fillRect(p.x - s * 0.28, p.y - s * 1.85, s * 0.55, s * 0.55);
    ctx.fillStyle = "rgba(90, 55, 30, 0.35)";
    ctx.fillRect(p.x - s * 0.22, p.y - s * 0.35, s * 0.45, s * 0.55);
    ctx.restore();
  }

  function paintCrab(u: number, v: number, spook: number, time: number, view: View): void {
    const p = sandToScreen(u, v, view);
    const s = Math.min(view.w, view.h) * 0.016;
    const bob = Math.sin(time * 10) * (spook > 0 ? 2 : 0.6);
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = "#c45b3a";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.4, s, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = -2; i <= 2; i += 1) {
      if (i === 0) continue;
      ctx.strokeStyle = "#a0442c";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(i * s * 0.9, s * (0.8 + (i % 2) * 0.3));
      ctx.stroke();
    }
    ctx.fillStyle = "#2a1a12";
    ctx.beginPath();
    ctx.arc(-s * 0.35, -s * 0.2, s * 0.18, 0, Math.PI * 2);
    ctx.arc(s * 0.35, -s * 0.2, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function paintGull(u: number, v: number, wing: number, view: View, sky: Sky): void {
    const x = u * view.w;
    const y = sandTop(view) * (0.15 + v);
    const flap = Math.sin(wing) * 0.55;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = rgbCss(sky.foam, 0.9);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-14, flap * 6);
    ctx.quadraticCurveTo(0, -4 - flap * 4, 14, flap * 6);
    ctx.stroke();
    ctx.fillStyle = rgbCss(sky.foam, 0.95);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function paintPenguin(bird: Penguin, view: View, reduceMotion: boolean): void {
    const p = sandToScreen(bird.u, bird.v, view);
    const scale = Math.min(view.w, view.h);
    const s = scale * 0.018;
    const waddle = reduceMotion ? 0 : Math.sin(bird.phase) * (bird.mood === "huddle" ? 0.4 : 1.6);
    const lean = bird.facing * (bird.mood === "swim" ? 0.35 : 0.12);
    ctx.save();
    ctx.translate(p.x, p.y + bird.bob * 1.2);
    ctx.rotate(lean);
    ctx.scale(bird.facing, 1);

    // Soft contact shadow.
    ctx.fillStyle = "rgba(60, 40, 25, 0.18)";
    ctx.beginPath();
    ctx.ellipse(0, s * 1.15, s * 0.9, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body: African penguin black back, white belly, pinkish feet.
    ctx.fillStyle = "#1d2430";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.72, s * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f0ea";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.12, s * 0.48, s * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // Black chest band.
    ctx.strokeStyle = "#1d2430";
    ctx.lineWidth = Math.max(1.2, s * 0.18);
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, -s * 0.05);
    ctx.quadraticCurveTo(0, s * 0.15, s * 0.42, -s * 0.05);
    ctx.stroke();

    // Head.
    ctx.fillStyle = "#1d2430";
    ctx.beginPath();
    ctx.arc(0, -s * 1.05, s * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f0ea";
    ctx.beginPath();
    ctx.ellipse(s * 0.08, -s * 0.95, s * 0.22, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye and beak.
    ctx.fillStyle = "#f7f7f7";
    ctx.beginPath();
    ctx.arc(s * 0.16, -s * 1.12, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1512";
    ctx.beginPath();
    ctx.arc(s * 0.18, -s * 1.12, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d98a3a";
    ctx.beginPath();
    ctx.moveTo(s * 0.28, -s * 1.0);
    ctx.lineTo(s * 0.62, -s * 0.95);
    ctx.lineTo(s * 0.28, -s * 0.88);
    ctx.closePath();
    ctx.fill();

    // Flippers.
    const flap = reduceMotion ? 0 : Math.sin(bird.phase * 1.3) * 0.35;
    ctx.fillStyle = "#1d2430";
    ctx.save();
    ctx.translate(-s * 0.55, -s * 0.1);
    ctx.rotate(-0.5 + flap);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.22, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(s * 0.55, -s * 0.05);
    ctx.rotate(0.45 - flap);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.2, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Feet.
    ctx.fillStyle = "#e29a62";
    ctx.beginPath();
    ctx.ellipse(-s * 0.22 + waddle * 0.15, s * 1.05, s * 0.22, s * 0.12, -0.2, 0, Math.PI * 2);
    ctx.ellipse(s * 0.22 - waddle * 0.15, s * 1.05, s * 0.22, s * 0.12, 0.2, 0, Math.PI * 2);
    ctx.fill();

    if (bird.mood === "friend") {
      ctx.fillStyle = "rgba(255, 210, 160, 0.55)";
      ctx.beginPath();
      ctx.arc(s * 0.7, -s * 1.5, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    if (bird.mood === "peck") {
      ctx.translate(0, s * 0.15);
      ctx.rotate(0.35);
    }
    ctx.restore();
  }

  function paintScorePop(
    u: number,
    v: number,
    points: number,
    life: number,
    kind: CollectKind,
    view: View,
  ): void {
    const p = sandToScreen(u, v, view);
    const rise = (1 - life) * 28;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, life * 1.4));
    ctx.font = `600 ${Math.max(14, Math.min(view.w, view.h) * 0.032)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle =
      kind === "coin" ? "#ffe08a" : kind === "castle" ? "#f0d2a0" : "#fff6ea";
    ctx.strokeStyle = "rgba(40, 24, 12, 0.35)";
    ctx.lineWidth = 3;
    const text = `+${points}`;
    ctx.strokeText(text, p.x, p.y - rise);
    ctx.fillText(text, p.x, p.y - rise);
    ctx.restore();
  }

  function paintGrains(sim: ShoreSim, view: View, sky: Sky): void {
    for (const grain of sim.grains) {
      const p = sandToScreen(grain.u, grain.v, view);
      const alpha = Math.max(0, Math.min(1, grain.life * 2));
      ctx.fillStyle = rgbCss(
        grain.wet > 0.45 ? sky.sandWet : sky.sandDry,
        alpha * 0.85,
      );
      ctx.fillRect(p.x, p.y, 2.2, 2.2);
    }
  }

  return {
    resize(view, nextDpr) {
      dpr = nextDpr;
      const w = Math.max(1, Math.floor(view.w * dpr));
      const h = Math.max(1, Math.floor(view.h * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      canvas.style.width = `${view.w}px`;
      canvas.style.height = `${view.h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    draw(sim, view, reduceMotion) {
      const sky = skyAt(sim.sun);
      ctx.fillStyle = rgbCss(sky.skyLow);
      ctx.fillRect(0, 0, view.w, view.h);
      paintSky(view, sky, sim.sun, sim.time, reduceMotion);
      paintSea(view, sim, sky);
      paintSandField(sim, view, sky);
      paintGrains(sim, view, sky);

      // Sort loot by v so nearer items paint over farther ones.
      const ordered = sim.loot.slice().sort((a, b) => a.v - b.v);
      for (const item of ordered) paintLoot(item, view, sky);

      for (const castle of sim.castles) {
        paintBuiltCastle(castle.u, castle.v, castle.height, castle.life, view);
      }

      // Penguins under the crab / feet so toes can still cover them.
      const colony = sim.penguins.slice().sort((a, b) => a.v - b.v);
      for (const bird of colony) paintPenguin(bird, view, reduceMotion);

      paintCrab(sim.crab.u, sim.crab.v, sim.crab.spook, sim.time, view);
      for (const foot of sim.feet.values()) {
        paintFoot(foot.u, foot.v, foot.radius, foot.bury, view);
      }
      if (sim.gull) paintGull(sim.gull.u, sim.gull.v, sim.gull.wing, view, sky);

      for (const pop of sim.pops) {
        paintScorePop(pop.u, pop.v, pop.points, pop.life, pop.kind, view);
      }

      const veil = ctx.createLinearGradient(0, sandTop(view), 0, view.h);
      veil.addColorStop(0, "rgba(255, 214, 160, 0)");
      veil.addColorStop(1, `rgba(255, 170, 90, ${0.04 + sim.sun * 0.08})`);
      ctx.fillStyle = veil;
      ctx.fillRect(0, sandTop(view), view.w, view.h - sandTop(view));
    },
  };
}
