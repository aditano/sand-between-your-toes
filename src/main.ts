import "./style.css";
import { createAudio } from "./audio";
import { MAX_POINTERS } from "./constants";
import { discoveryQuip } from "./copy";
import { themeHex } from "./palette";
import { pixelRatio, screenToSand, type View } from "./project";
import { createPainter } from "./render";
import { createSim, type BeachEvent } from "./sim";
import { Session } from "./stats";
import { bindHud } from "./ui";

type Finger = {
  u: number;
  v: number;
  markU: number;
  markV: number;
  radius: number;
  scoop: number;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function showFallback(message: string): void {
  const fallback = document.querySelector<HTMLElement>("#fallback");
  const canvas = document.querySelector<HTMLElement>("#view");
  if (canvas) canvas.hidden = true;
  if (fallback) {
    fallback.hidden = false;
    fallback.textContent = message;
  }
}

function handleEvents(
  events: BeachEvent[],
  session: Session,
  audio: ReturnType<typeof createAudio>,
): void {
  for (const event of events) {
    const line = discoveryQuip(event);
    // Finds and critters should speak even if a streak line just fired.
    if (line) session.announce(line, true);
    switch (event.kind) {
      case "shell":
        audio.blip("shell");
        break;
      case "treasure":
        audio.blip("treasure");
        break;
      case "castle":
        audio.blip("castle");
        break;
      case "surge":
        audio.splash();
        break;
      case "gull":
        if (event.first) audio.cry();
        break;
      case "touch":
      case "uncover":
      case "rebury":
      case "erased":
      case "crab":
      case "bury":
      case "unbury":
        break;
      default: {
        const leftover: never = event;
        void leftover;
      }
    }
  }
}

function main(): void {
  const appNode = document.querySelector<HTMLElement>("#app");
  const canvasNode = document.querySelector<HTMLCanvasElement>("#view");
  if (!appNode || !canvasNode) return;
  const app = appNode;
  const canvas = canvasNode;

  const maybePainter = createPainter(canvas);
  if (!maybePainter) {
    showFallback("This beach needs a canvas. An actual shore also works.");
    return;
  }
  const painter = maybePainter;

  const sim = createSim();
  const audio = createAudio();
  const hud = bindHud();
  const session = new Session((text) => hud.showQuip(text));
  const fingers = new Map<number, Finger>();
  let reduceMotion = prefersReducedMotion();
  let view: View = { w: 1, h: 1 };
  let lastTheme = "";

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  hud.setHint(coarse ? "Drag your toes through the sand" : "Click and drag through the sand");
  hud.setMuted(audio.muted);
  window.setTimeout(() => hud.hideHint(), 5600);

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  motionQuery.addEventListener("change", () => {
    reduceMotion = motionQuery.matches;
  });

  hud.onMute(() => {
    audio.unlock();
    hud.setMuted(audio.toggleMuted());
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "m" || event.key === "M") {
      audio.unlock();
      hud.setMuted(audio.toggleMuted());
    }
  });

  function viewport(): View {
    const vv = window.visualViewport;
    return {
      w: Math.max(1, Math.round(vv?.width ?? window.innerWidth)),
      h: Math.max(1, Math.round(vv?.height ?? window.innerHeight)),
    };
  }

  function chooseGrid(next: View): { cols: number; rows: number } {
    const area = next.w * next.h;
    // Phones stay dense enough for crisp digs while keeping the iOS GPU calm.
    if (area < 420_000) return { cols: 104, rows: 78 };
    if (area < 1_100_000) return { cols: 120, rows: 90 };
    return { cols: 140, rows: 104 };
  }

  function resize(): void {
    view = viewport();
    app.style.height = `${view.h}px`;
    const grid = chooseGrid(view);
    sim.resize(grid.cols, grid.rows);
    painter.resize(view, pixelRatio());
  }

  function pointerSand(event: PointerEvent): { u: number; v: number } | null {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return screenToSand(x, y, view);
  }

  function onDown(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (fingers.size >= MAX_POINTERS) return;
    const hit = pointerSand(event);
    if (!hit) return;
    event.preventDefault();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Pointer may already be gone.
    }
    audio.unlock();
    hud.hideHint();
    app.classList.add("is-down");
    const radius = event.pointerType === "touch" ? 0.07 : 0.048;
    fingers.set(event.pointerId, {
      u: hit.u,
      v: hit.v,
      markU: hit.u,
      markV: hit.v,
      radius,
      scoop: 0,
    });
    const events = sim.press(event.pointerId, hit.u, hit.v, radius);
    audio.scrape(0.8, sim.sampleWet(hit.u, hit.v));
    session.press(performance.now(), true);
    handleEvents(events, session, audio);
  }

  function onMove(event: PointerEvent): void {
    const finger = fingers.get(event.pointerId);
    const hit = pointerSand(event);
    if (!hit || !finger) return;
    const du = hit.u - finger.u;
    const dv = hit.v - finger.v;
    const dist = Math.hypot(du, dv);
    const force = Math.min(1, 0.35 + dist * 14);
    // Scoop = upward pull. Build toward a castle when the drag climbs the beach.
    const climb = Math.max(0, -dv);
    finger.scoop = Math.min(1, finger.scoop * 0.78 + climb * 22);
    finger.u = hit.u;
    finger.v = hit.v;
    const events = sim.drag(
      event.pointerId,
      hit.u,
      hit.v,
      finger.radius,
      force,
      finger.scoop,
    );
    const mu = hit.u - finger.markU;
    const mv = hit.v - finger.markV;
    if (mu * mu + mv * mv > 0.00045) {
      finger.markU = hit.u;
      finger.markV = hit.v;
      session.stroke(performance.now());
      audio.scrape(force, sim.sampleWet(hit.u, hit.v));
    } else {
      session.hold(performance.now());
    }
    handleEvents(events, session, audio);
  }

  function onUp(event: PointerEvent): void {
    if (!fingers.has(event.pointerId)) return;
    fingers.delete(event.pointerId);
    const events = sim.release(event.pointerId);
    handleEvents(events, session, audio);
    if (fingers.size === 0) app.classList.remove("is-down");
    try {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
  }

  canvas.addEventListener("pointerdown", onDown, { passive: false });
  canvas.addEventListener("pointermove", onMove, { passive: false });
  canvas.addEventListener(
    "touchmove",
    (event) => {
      if (event.cancelable) event.preventDefault();
    },
    { passive: false },
  );
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  // Older iOS Safari pinch-zoom gesture.
  document.addEventListener(
    "gesturestart",
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );

  resize();
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);

  let last = performance.now();

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const visible = document.visibilityState !== "hidden";
    if (visible) {
      if (fingers.size > 0) session.hold(now);
      const events = sim.tick(dt, reduceMotion);
      handleEvents(events, session, audio);
      audio.wash(Math.max(0, sim.waveFront + 0.05) * 2.2);
      painter.draw(sim, view, reduceMotion);
      const theme = themeHex(sim.sun);
      if (theme !== lastTheme) {
        hud.setTheme(theme);
        lastTheme = theme;
      }
    }
    session.tick(dt, visible);
    hud.render(session.view());
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
