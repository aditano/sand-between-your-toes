import { MAX_PENGUINS } from "./constants";
import { clamp } from "./project";

export type PenguinMood =
  | "waddle"
  | "huddle"
  | "swim"
  | "curious"
  | "startle"
  | "peck"
  | "friend";

export type Penguin = {
  id: number;
  u: number;
  v: number;
  facing: number;
  phase: number;
  mood: PenguinMood;
  timer: number;
  targetU: number;
  targetV: number;
  friend: number;
  bob: number;
};

export type PenguinEvent =
  | { kind: "penguin"; mood: "curious" | "startle" | "huddle" | "swim" | "peck" }
  | { kind: "penguin_find"; points: number }
  | { kind: "penguin_friend"; points: number };

let nextId = 1;

export function spawnColony(rng: () => number): Penguin[] {
  const count = 2 + (rng() > 0.55 ? 1 : 0);
  const birds: Penguin[] = [];
  for (let i = 0; i < Math.min(MAX_PENGUINS, count); i += 1) {
    const u = 0.18 + i * 0.22 + rng() * 0.08;
    const v = 0.3 + rng() * 0.12;
    birds.push({
      id: nextId++,
      u,
      v,
      facing: rng() > 0.5 ? 1 : -1,
      phase: rng() * Math.PI * 2,
      mood: "waddle",
      timer: 1 + rng() * 2.5,
      targetU: u + (rng() - 0.5) * 0.2,
      targetV: v,
      friend: 0,
      bob: 0,
    });
  }
  return birds;
}

function setMood(bird: Penguin, mood: PenguinMood, timer: number, facing?: number): void {
  bird.mood = mood;
  bird.timer = timer;
  if (facing !== undefined) bird.facing = facing;
}

function pickWander(bird: Penguin, rng: () => number): void {
  bird.targetU = clamp(bird.u + (rng() - 0.5) * 0.28, 0.06, 0.94);
  bird.targetV = clamp(0.26 + rng() * 0.22, 0.22, 0.55);
  setMood(bird, "waddle", 1.4 + rng() * 2.4);
}

export type PenguinTickInput = {
  dt: number;
  reduceMotion: boolean;
  time: number;
  waveFront: number;
  feet: Iterable<{ u: number; v: number; force: number; active: boolean }>;
  digNear: { u: number; v: number; force: number } | null;
  rng: () => number;
  /** Called when a penguin pecks near buried loot. Returns points if it found something. */
  onPeck: (u: number, v: number) => number;
};

export function tickPenguins(birds: Penguin[], input: PenguinTickInput): PenguinEvent[] {
  const events: PenguinEvent[] = [];
  const pace = input.reduceMotion ? 0.4 : 1;
  const dt = input.dt * pace;

  let nearestFoot: { u: number; v: number; force: number } | null = null;
  let nearestDist = 1;
  for (const foot of input.feet) {
    if (!foot.active) continue;
    for (const bird of birds) {
      const d = Math.hypot(foot.u - bird.u, foot.v - bird.v);
      if (d < nearestDist) {
        nearestDist = d;
        nearestFoot = foot;
      }
    }
  }

  for (let i = 0; i < birds.length; i += 1) {
    const bird = birds[i]!;
    bird.timer -= dt;
    bird.phase += dt * (bird.mood === "swim" ? 10 : bird.mood === "startle" ? 14 : 7);
    bird.bob = Math.sin(bird.phase) * (bird.mood === "huddle" ? 0.2 : 1);

    if (input.digNear) {
      const d = Math.hypot(input.digNear.u - bird.u, input.digNear.v - bird.v);
      if (d < 0.08 && input.digNear.force > 0.7 && bird.mood !== "startle") {
        setMood(bird, "startle", 0.9 + input.rng() * 0.5, input.digNear.u < bird.u ? 1 : -1);
        bird.targetU = clamp(bird.u + bird.facing * (0.12 + input.rng() * 0.1), 0.05, 0.95);
        bird.targetV = clamp(bird.v + 0.04, 0.22, 0.62);
        bird.friend = Math.max(0, bird.friend - 0.35);
        events.push({ kind: "penguin", mood: "startle" });
      } else if (
        d < 0.14 &&
        input.digNear.force < 0.55 &&
        bird.mood !== "startle" &&
        bird.mood !== "friend"
      ) {
        bird.friend = Math.min(1, bird.friend + 0.08);
        if (bird.friend >= 1) {
          setMood(bird, "friend", 2.2);
          bird.friend = 0.55;
          events.push({ kind: "penguin_friend", points: 25 });
        } else if (bird.mood !== "curious") {
          setMood(bird, "curious", 1.6, input.digNear.u < bird.u ? -1 : 1);
          bird.targetU = input.digNear.u;
          bird.targetV = clamp(input.digNear.v - 0.02, 0.24, 0.6);
          events.push({ kind: "penguin", mood: "curious" });
        }
      }
    }

    if (bird.mood === "waddle" && nearestFoot && nearestDist < 0.16 && bird.timer < 0.2) {
      setMood(bird, "curious", 1.8, nearestFoot.u < bird.u ? -1 : 1);
      bird.targetU = nearestFoot.u;
      bird.targetV = clamp(nearestFoot.v - 0.03, 0.24, 0.58);
      events.push({ kind: "penguin", mood: "curious" });
    }

    if (
      bird.mood === "waddle" &&
      input.waveFront > 0.05 &&
      bird.v < input.waveFront + 0.12 &&
      input.rng() < dt * 0.35
    ) {
      setMood(bird, "swim", 1.1 + input.rng() * 0.8);
      bird.targetU = clamp(bird.u + (input.rng() - 0.5) * 0.1, 0.08, 0.92);
      bird.targetV = Math.max(0.02, input.waveFront - 0.02);
      events.push({ kind: "penguin", mood: "swim" });
    }

    if (bird.mood === "waddle" && bird.timer <= 0) {
      // Occasional huddle with a neighbor.
      const pal = birds.find(
        (other) => other.id !== bird.id && Math.hypot(other.u - bird.u, other.v - bird.v) < 0.14,
      );
      if (pal && input.rng() < 0.35) {
        setMood(bird, "huddle", 1.6 + input.rng());
        setMood(pal, "huddle", 1.6 + input.rng(), bird.u < pal.u ? -1 : 1);
        bird.targetU = (bird.u + pal.u) * 0.5;
        bird.targetV = (bird.v + pal.v) * 0.5;
        events.push({ kind: "penguin", mood: "huddle" });
      } else if (input.rng() < 0.28) {
        setMood(bird, "peck", 0.7 + input.rng() * 0.5);
        events.push({ kind: "penguin", mood: "peck" });
        const found = input.onPeck(bird.u, bird.v);
        if (found > 0) events.push({ kind: "penguin_find", points: found });
      } else {
        pickWander(bird, input.rng);
      }
    }

    if (bird.timer <= 0 && bird.mood !== "waddle") {
      pickWander(bird, input.rng);
    }

    let speed = 0.035;
    switch (bird.mood) {
      case "waddle":
        speed = 0.04;
        break;
      case "curious":
        speed = 0.055;
        break;
      case "startle":
        speed = 0.14;
        break;
      case "swim":
        speed = 0.11;
        break;
      case "huddle":
        speed = 0.015;
        break;
      case "peck":
        speed = 0.01;
        break;
      case "friend":
        speed = 0.02;
        break;
      default: {
        const leftover: never = bird.mood;
        void leftover;
      }
    }

    const du = bird.targetU - bird.u;
    const dv = bird.targetV - bird.v;
    const dist = Math.hypot(du, dv);
    if (dist > 0.004) {
      bird.u += (du / dist) * speed * dt * 3.2;
      bird.v += (dv / dist) * speed * dt * 2.4;
      if (Math.abs(du) > 0.002) bird.facing = du >= 0 ? 1 : -1;
    }
    bird.u = clamp(bird.u, 0.04, 0.96);
    bird.v = clamp(bird.v, 0.02, 0.72);

    // Tiny footprints while waddling on dry-ish sand.
    if (
      (bird.mood === "waddle" || bird.mood === "curious") &&
      bird.v > 0.2 &&
      input.rng() < dt * 2.2
    ) {
      // Footprints are drawn as sand dents via caller callback elsewhere when needed.
      void input.time;
    }
  }

  return events;
}
