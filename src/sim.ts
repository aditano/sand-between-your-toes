import { COLS, MAX_GRAINS, ROWS } from "./constants";
import { mulberry32 } from "./rng";
import { clamp } from "./project";

export type BeachEvent =
  | { kind: "touch" }
  | { kind: "shell" }
  | { kind: "uncover" }
  | { kind: "treasure" }
  | { kind: "rebury" }
  | { kind: "castle" }
  | { kind: "erased"; by: "wave" | "touch" }
  | { kind: "crab" }
  | { kind: "surge" }
  | { kind: "bury" }
  | { kind: "unbury" }
  | { kind: "gull"; first: boolean };

export type Grain = {
  u: number;
  v: number;
  vx: number;
  vy: number;
  life: number;
  wet: number;
};

export type Shell = {
  u: number;
  v: number;
  size: number;
  hue: number;
  buried: number;
  found: boolean;
};

export type Castle = {
  u: number;
  v: number;
  life: number;
  height: number;
};

export type Treasure = {
  u: number;
  v: number;
  buried: number;
  found: boolean;
};

export type Crab = {
  u: number;
  v: number;
  dir: number;
  speed: number;
  spook: number;
};

export type Gull = {
  u: number;
  v: number;
  vx: number;
  life: number;
  wing: number;
};

export type Foot = {
  id: number;
  u: number;
  v: number;
  radius: number;
  bury: number;
  force: number;
  active: boolean;
};

export type ShoreSim = {
  cols: number;
  rows: number;
  height: Float32Array;
  wet: Float32Array;
  base: Float32Array;
  grains: Grain[];
  shells: Shell[];
  castles: Castle[];
  treasure: Treasure | null;
  crab: Crab;
  gull: Gull | null;
  feet: Map<number, Foot>;
  tide: number;
  wavePhase: number;
  waveFront: number;
  foam: number;
  sun: number;
  time: number;
  buriedOnce: boolean;
  gullSeen: boolean;
  resize: (cols: number, rows: number) => void;
  dig: (u: number, v: number, radius: number, force: number, scoop: number) => BeachEvent[];
  press: (id: number, u: number, v: number, radius: number) => BeachEvent[];
  drag: (
    id: number,
    u: number,
    v: number,
    radius: number,
    force: number,
    scoop?: number,
  ) => BeachEvent[];
  release: (id: number) => BeachEvent[];
  tick: (dt: number, reduceMotion: boolean) => BeachEvent[];
  sampleWet: (u: number, v: number) => number;
};

function idx(x: number, y: number, cols: number): number {
  return y * cols + x;
}

function cell(u: number, v: number, cols: number, rows: number): { x: number; y: number } {
  return {
    x: clamp(Math.floor(u * cols), 0, cols - 1),
    y: clamp(Math.floor(v * rows), 0, rows - 1),
  };
}

function noise2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function fillBase(base: Float32Array, cols: number, rows: number): void {
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const u = x / cols;
      const v = y / rows;
      const dunes =
        Math.sin(u * 9.2 + v * 2.1) * 0.045 +
        Math.sin(u * 21 + v * 7.4) * 0.018 +
        noise2(u * 18, v * 14) * 0.03;
      const slope = (1 - v) * 0.08;
      base[idx(x, y, cols)] = 0.42 + slope + dunes;
    }
  }
}

function fillWet(wet: Float32Array, cols: number, rows: number, tide: number): void {
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const v = y / rows;
      const shore = 0.08 + tide * 0.14;
      // Keep most of the beach warm and dry. Only the waterline goes dark.
      const damp = clamp(1 - (v - shore) / 0.18, 0, 1);
      wet[idx(x, y, cols)] = damp * damp * (0.62 + noise2(x * 0.2, y * 0.17) * 0.18);
    }
  }
}

function spawnShells(rng: () => number, count: number): Shell[] {
  const shells: Shell[] = [];
  for (let i = 0; i < count; i += 1) {
    shells.push({
      u: 0.08 + rng() * 0.84,
      v: 0.28 + rng() * 0.62,
      size: 0.012 + rng() * 0.018,
      hue: rng(),
      // Most shells start hidden so digging feels like a find.
      buried: 0.55 + rng() * 0.4,
      found: false,
    });
  }
  return shells;
}

export function createSim(): ShoreSim {
  const rng = mulberry32(0x5a11d);
  let cols = COLS;
  let rows = ROWS;
  let height = new Float32Array(cols * rows);
  let wet = new Float32Array(cols * rows);
  let base = new Float32Array(cols * rows);
  const grains: Grain[] = [];
  let shells = spawnShells(rng, 7);
  const castles: Castle[] = [];
  let treasure: Treasure | null = {
    u: 0.35 + rng() * 0.3,
    v: 0.55 + rng() * 0.25,
    buried: 0.72,
    found: false,
  };
  const crab: Crab = {
    u: 0.15 + rng() * 0.7,
    v: 0.55 + rng() * 0.3,
    dir: rng() > 0.5 ? 1 : -1,
    speed: 0.04 + rng() * 0.03,
    spook: 0,
  };
  let gull: Gull | null = null;
  const feet = new Map<number, Foot>();
  let tide = 0.35;
  let wavePhase = 0;
  let waveFront = -0.05;
  let foam = 0;
  let sun = 0.15;
  let time = 0;
  let buriedOnce = false;
  let gullSeen = false;
  let nextGull = 12 + rng() * 18;
  let nextSurgeLine = 0;
  let settleTimer = 0;

  fillBase(base, cols, rows);
  height.set(base);
  fillWet(wet, cols, rows, tide);

  function sample(arr: Float32Array, u: number, v: number): number {
    const x = clamp(u * (cols - 1), 0, cols - 1);
    const y = clamp(v * (rows - 1), 0, rows - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(cols - 1, x0 + 1);
    const y1 = Math.min(rows - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const a = arr[idx(x0, y0, cols)];
    const b = arr[idx(x1, y0, cols)];
    const c = arr[idx(x0, y1, cols)];
    const d = arr[idx(x1, y1, cols)];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }

  function emitGrains(u: number, v: number, count: number, force: number, wetness: number): void {
    const n = Math.min(count, MAX_GRAINS - grains.length);
    for (let i = 0; i < n; i += 1) {
      const angle = rng() * Math.PI * 2;
      const speed = (0.08 + rng() * 0.18) * (0.4 + force);
      grains.push({
        u,
        v,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.7 - 0.02,
        life: 0.35 + rng() * 0.45,
        wet: wetness,
      });
    }
  }

  function deform(
    u: number,
    v: number,
    radius: number,
    dig: number,
    pile: number,
    wetAdd: number,
  ): void {
    const r = Math.max(0.02, radius);
    const x0 = clamp(Math.floor((u - r) * cols) - 1, 0, cols - 1);
    const x1 = clamp(Math.ceil((u + r) * cols) + 1, 0, cols - 1);
    const y0 = clamp(Math.floor((v - r) * rows) - 1, 0, rows - 1);
    const y1 = clamp(Math.ceil((v + r) * rows) + 1, 0, rows - 1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cu = (x + 0.5) / cols;
        const cv = (y + 0.5) / rows;
        const dx = (cu - u) / r;
        const dy = (cv - v) / (r * 0.85);
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const fall = (1 - d2) * (1 - d2);
        const i = idx(x, y, cols);
        const ring = Math.abs(Math.sqrt(d2) - 0.62);
        const rim = ring < 0.28 ? (1 - ring / 0.28) * pile : 0;
        height[i] = clamp(height[i] - dig * fall + rim, 0.05, 1.35);
        wet[i] = clamp(wet[i] + wetAdd * fall, 0, 1);
      }
    }
  }

  function checkDiscoveries(u: number, v: number, digDepth: number): BeachEvent[] {
    const events: BeachEvent[] = [];
    for (const shell of shells) {
      const du = shell.u - u;
      const dv = shell.v - v;
      if (du * du + dv * dv > 0.01) continue;
      if (!shell.found && digDepth > shell.buried * 0.35) {
        shell.found = true;
        shell.buried = Math.max(0, shell.buried - 0.45);
        events.push({ kind: "shell" });
      } else if (shell.found && shell.buried > 0.05 && digDepth > 0.02) {
        shell.buried = Math.max(0, shell.buried - digDepth * 2);
        if (shell.buried < 0.08) events.push({ kind: "uncover" });
      }
    }
    if (treasure && !treasure.found) {
      const du = treasure.u - u;
      const dv = treasure.v - v;
      if (du * du + dv * dv < 0.012 && digDepth > treasure.buried * 0.25) {
        treasure.found = true;
        treasure.buried = 0;
        events.push({ kind: "treasure" });
      }
    }
    return events;
  }

  function maybeCastle(u: number, v: number, scoop: number): BeachEvent | null {
    if (scoop < 0.48 || castles.length >= 3) return null;
    if (v < 0.22 || v > 0.92) return null;
    for (const castle of castles) {
      const du = castle.u - u;
      const dv = castle.v - v;
      // One scoop usually makes one keep. Keep them spaced.
      if (du * du + dv * dv < 0.045) return null;
    }
    castles.push({ u, v: clamp(v, 0.26, 0.88), life: 1, height: 0.55 + scoop * 0.35 });
    deform(u, v, 0.05, -0.1, 0.2, 0.1);
    return { kind: "castle" };
  }

  function resize(nextCols: number, nextRows: number): void {
    if (nextCols === cols && nextRows === rows) return;
    cols = nextCols;
    rows = nextRows;
    height = new Float32Array(cols * rows);
    wet = new Float32Array(cols * rows);
    base = new Float32Array(cols * rows);
    fillBase(base, cols, rows);
    height.set(base);
    fillWet(wet, cols, rows, tide);
  }

  const api: ShoreSim = {
    get cols() {
      return cols;
    },
    get rows() {
      return rows;
    },
    get height() {
      return height;
    },
    get wet() {
      return wet;
    },
    get base() {
      return base;
    },
    grains,
    get shells() {
      return shells;
    },
    castles,
    get treasure() {
      return treasure;
    },
    crab,
    get gull() {
      return gull;
    },
    feet,
    get tide() {
      return tide;
    },
    get wavePhase() {
      return wavePhase;
    },
    get waveFront() {
      return waveFront;
    },
    get foam() {
      return foam;
    },
    get sun() {
      return sun;
    },
    get time() {
      return time;
    },
    get buriedOnce() {
      return buriedOnce;
    },
    get gullSeen() {
      return gullSeen;
    },
    resize,
    sampleWet(u, v) {
      return sample(wet, u, v);
    },
    dig(u, v, radius, force, scoop) {
      const events: BeachEvent[] = [];
      const wetness = sample(wet, u, v);
      const digAmt = (0.045 + force * 0.075) * (wetness > 0.45 ? 0.78 : 1);
      const pileAmt = digAmt * (0.6 + scoop * 0.85);
      deform(u, v, radius, digAmt, pileAmt, wetness > 0.4 ? 0.025 : -0.012);
      emitGrains(u, v, 5 + Math.floor(force * 9), force, wetness);
      events.push(...checkDiscoveries(u, v, digAmt + force * 0.1));

      // Scooping packs a castle. Digging (low scoop) can knock one over.
      // Never erase in the same stroke that just built one.
      if (scoop >= 0.48) {
        // Pack the mound under the fingers, not farther toward the water.
        const built = maybeCastle(u, clamp(v, 0.26, 0.88), scoop);
        if (built) events.push(built);
      } else if (force > 0.62) {
        for (let i = castles.length - 1; i >= 0; i -= 1) {
          const castle = castles[i];
          const du = castle.u - u;
          const dv = castle.v - v;
          if (du * du + dv * dv < radius * radius * 0.85) {
            castles.splice(i, 1);
            events.push({ kind: "erased", by: "touch" });
          }
        }
      }

      const spook =
        (crab.u - u) * (crab.u - u) + (crab.v - v) * (crab.v - v) < radius * radius * 2.4;
      if (spook && crab.spook <= 0) {
        crab.spook = 1.4;
        crab.dir = u < crab.u ? 1 : -1;
        events.push({ kind: "crab" });
      }
      return events;
    },
    press(id, u, v, radius) {
      feet.set(id, { id, u, v, radius, bury: 0.15, force: 1, active: true });
      return api.dig(u, v, radius, 0.9, 0.15);
    },
    drag(id, u, v, radius, force, scoop = 0.2) {
      const foot = feet.get(id);
      if (foot) {
        foot.u = u;
        foot.v = v;
        foot.radius = radius;
        foot.force = force;
        // Scoops pack sand into castles. Only still-ish digs bury the feet.
        if (scoop < 0.28) foot.bury = clamp(foot.bury + force * 0.055, 0, 1);
        else foot.bury = clamp(foot.bury - scoop * 0.08, 0, 1);
      }
      const events = api.dig(u, v, radius, force, scoop);
      if (foot && scoop < 0.28 && foot.bury > 0.88 && !buriedOnce) {
        buriedOnce = true;
        events.push({ kind: "bury" });
      }
      return events;
    },
    release(id) {
      const events: BeachEvent[] = [];
      const foot = feet.get(id);
      if (foot) {
        if (foot.bury > 0.75) events.push({ kind: "unbury" });
        foot.active = false;
        feet.delete(id);
      }
      return events;
    },
    tick(dt, reduceMotion) {
      const events: BeachEvent[] = [];
      const pace = reduceMotion ? 0.35 : 1;
      time += dt * pace;
      sun = clamp(0.08 + (Math.sin(time * 0.015) * 0.5 + 0.5) * 0.85, 0, 1);
      tide = 0.28 + Math.sin(time * 0.07) * 0.16;
      wavePhase += dt * (reduceMotion ? 0.55 : 1.35);
      const waveTarget = -0.08 + (0.5 + 0.5 * Math.sin(wavePhase)) * (0.22 + tide * 0.2);
      waveFront += (waveTarget - waveFront) * Math.min(1, dt * 1.8);
      foam = clamp(0.35 + Math.sin(wavePhase * 1.7) * 0.4, 0, 1);

      settleTimer += dt;
      if (settleTimer > 0.05) {
        settleTimer = 0;
        for (let y = 1; y < rows - 1; y += 1) {
          for (let x = 1; x < cols - 1; x += 1) {
            const i = idx(x, y, cols);
            const avg =
              (height[idx(x - 1, y, cols)] +
                height[idx(x + 1, y, cols)] +
                height[idx(x, y - 1, cols)] +
                height[idx(x, y + 1, cols)]) *
              0.25;
            height[i] += (avg - height[i]) * 0.012;
            height[i] += (base[i] - height[i]) * 0.0028;
            const shore = 0.08 + tide * 0.14;
            const v = y / rows;
            const targetWet = clamp(1 - (v - shore) / 0.18, 0, 1);
            wet[i] += (targetWet * targetWet * 0.7 - wet[i]) * 0.018;
          }
        }
      }

      const washBand = waveFront + 0.04;
      if (washBand > 0) {
        const washRows = Math.min(rows - 1, Math.floor(washBand * rows) + 2);
        for (let y = 0; y <= washRows; y += 1) {
          const influence = clamp(1 - Math.abs(y / rows - waveFront) / 0.08, 0, 1);
          if (influence <= 0) continue;
          for (let x = 0; x < cols; x += 1) {
            const i = idx(x, y, cols);
            height[i] += (base[i] - height[i]) * influence * 0.12;
            wet[i] = clamp(wet[i] + influence * 0.18, 0, 1);
          }
        }
        for (let i = castles.length - 1; i >= 0; i -= 1) {
          const castle = castles[i];
          if (castle.v < waveFront + 0.06) {
            castle.life -= dt * 1.6;
            if (castle.life <= 0) {
              castles.splice(i, 1);
              events.push({ kind: "erased", by: "wave" });
            }
          }
        }
        if (waveFront > 0.08 && time - nextSurgeLine > 8) {
          nextSurgeLine = time;
          events.push({ kind: "surge" });
        }
      }

      for (let i = grains.length - 1; i >= 0; i -= 1) {
        const g = grains[i];
        g.life -= dt;
        g.u += g.vx * dt;
        g.v += g.vy * dt;
        g.vy += 0.35 * dt;
        g.vx *= 0.96;
        if (g.life <= 0 || g.u < 0 || g.u > 1 || g.v > 1.05) grains.splice(i, 1);
        else {
          const { x, y } = cell(g.u, g.v, cols, rows);
          const iCell = idx(x, y, cols);
          height[iCell] = clamp(height[iCell] + 0.0025, 0.05, 1.35);
        }
      }

      crab.spook = Math.max(0, crab.spook - dt);
      const crabSpeed = crab.speed * (crab.spook > 0 ? 3.2 : 1) * pace;
      crab.u += crab.dir * crabSpeed * dt;
      crab.v += Math.sin(time * 2.2 + crab.u * 8) * 0.01 * dt * pace;
      if (crab.u < 0.04 || crab.u > 0.96) crab.dir *= -1;
      crab.v = clamp(crab.v, 0.35, 0.92);

      nextGull -= dt * pace;
      if (!gull && nextGull <= 0) {
        const fromLeft = rng() > 0.5;
        gull = {
          u: fromLeft ? -0.1 : 1.1,
          v: 0.02 + rng() * 0.16,
          vx: (fromLeft ? 1 : -1) * (0.12 + rng() * 0.08),
          life: 1,
          wing: 0,
        };
        const first = !gullSeen;
        gullSeen = true;
        events.push({ kind: "gull", first });
        nextGull = 16 + rng() * 22;
      }
      if (gull) {
        gull.u += gull.vx * dt * pace;
        gull.wing += dt * (reduceMotion ? 4 : 10);
        gull.v += Math.sin(gull.wing * 0.7) * 0.01 * dt;
        if (gull.u < -0.2 || gull.u > 1.2) gull = null;
      }

      if (treasure?.found && treasure.buried < 0.01 && rng() < dt * 0.02) {
        treasure.buried = 0.2;
        events.push({ kind: "rebury" });
      }

      for (const foot of feet.values()) {
        if (foot.active) foot.bury = clamp(foot.bury + dt * 0.12, 0, 1);
      }

      return events;
    },
  };

  return api;
}
