import { rgbCss, skyAt, type Sky } from "./palette";
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

  function paintShell(
    u: number,
    v: number,
    size: number,
    hue: number,
    buried: number,
    view: View,
    sky: Sky,
  ): void {
    if (buried > 0.85) return;
    const p = sandToScreen(u, v, view);
    const s = size * Math.min(view.w, view.h);
    const alpha = 1 - buried;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(hue * Math.PI);
    ctx.fillStyle = rgbCss(
      hue < 0.33 ? sky.foam : hue < 0.66 ? sky.sunGlow : sky.sandShade,
      0.55 + alpha * 0.4,
    );
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(90, 55, 35, ${0.25 * alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, 0);
    ctx.quadraticCurveTo(0, -s * 0.4, s * 0.6, 0);
    ctx.stroke();
    ctx.restore();
  }

  function paintCastle(u: number, v: number, height: number, life: number, view: View): void {
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

  function paintTreasure(u: number, v: number, buried: number, view: View): void {
    if (buried > 0.4) return;
    const p = sandToScreen(u, v, view);
    const s = Math.min(view.w, view.h) * 0.028;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-0.4);
    ctx.fillStyle = "#c3a15a";
    ctx.fillRect(-s, -s * 0.45, s * 2, s * 0.9);
    ctx.strokeStyle = "#8a6a32";
    ctx.strokeRect(-s, -s * 0.45, s * 2, s * 0.9);
    ctx.fillStyle = "#6ea8b8";
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2);
    ctx.fill();
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

  function paintGull(
    u: number,
    v: number,
    wing: number,
    view: View,
    sky: Sky,
  ): void {
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
      for (const shell of sim.shells) {
        paintShell(shell.u, shell.v, shell.size, shell.hue, shell.buried, view, sky);
      }
      if (sim.treasure?.found) {
        paintTreasure(sim.treasure.u, sim.treasure.v, sim.treasure.buried, view);
      }
      for (const castle of sim.castles) {
        paintCastle(castle.u, castle.v, castle.height, castle.life, view);
      }
      paintCrab(sim.crab.u, sim.crab.v, sim.crab.spook, sim.time, view);
      for (const foot of sim.feet.values()) {
        paintFoot(foot.u, foot.v, foot.radius, foot.bury, view);
      }
      if (sim.gull) paintGull(sim.gull.u, sim.gull.v, sim.gull.wing, view, sky);

      const veil = ctx.createLinearGradient(0, sandTop(view), 0, view.h);
      veil.addColorStop(0, "rgba(255, 214, 160, 0)");
      veil.addColorStop(1, `rgba(255, 170, 90, ${0.04 + sim.sun * 0.08})`);
      ctx.fillStyle = veil;
      ctx.fillRect(0, sandTop(view), view.w, view.h - sandTop(view));
    },
  };
}
